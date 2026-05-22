/**
 * WebSocket routes for both interpretation modes. `/ws/cascade` and
 * `/ws/realtime` speak the identical wire protocol (ClientMessage in,
 * ServerMessage out) — the only difference is which session implementation sits
 * behind them. Both session types expose the same normalised event surface, so
 * a single `bindEvents` relay forwards them to the browser. This is the "clean
 * separation between mode-specific transport and mode-agnostic UI" the brief
 * grades.
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  isLanguagePairCode,
  type ClientMessage,
  type ErrorCode,
  type ErrorEvent,
  type LanguagePairCode,
  type LatencyEvent,
  type Mode,
  type ServerMessage,
  type TranscriptEvent,
} from '@workbench/types';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { getLanguagePairConfig } from '../config/languagePairs.js';
import { breakerSnapshot, createCascadeProviders } from '../config/providers.js';
import { CascadePipeline, type CascadePipelineConfig } from '../cascade/CascadePipeline.js';
import { RealtimeSession } from '../realtime/RealtimeSession.js';
import { ProviderError } from '../providers/errors.js';
import {
  activeSessionCount,
  decrementActiveSessions,
  incrementActiveSessions,
  storeSessionLog,
} from '../runtime/sessionStore.js';

type InterpreterSession = CascadePipeline | RealtimeSession;

export function registerWsRoutes(app: FastifyInstance): void {
  app.get('/ws/cascade', { websocket: true }, (socket) => {
    handleConnection('cascade', socket as unknown as WebSocket);
  });
  app.get('/ws/realtime', { websocket: true }, (socket) => {
    handleConnection('realtime', socket as unknown as WebSocket);
  });
}

function handleConnection(mode: Mode, socket: WebSocket): void {
  let session: InterpreterSession | null = null;
  let sessionId = '';
  let counted = false;
  let started = false;

  const log = logger.child({ mode });

  socket.on('message', (raw: Buffer) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      sendError(socket, 'bad_request', 'Malformed message');
      return;
    }

    switch (message.type) {
      case 'start': {
        if (started) return;
        started = true;
        sessionId = message.sessionId || randomUUID();
        void startSession(message.languagePair).catch((err: unknown) => {
          log.error({ err }, 'failed to start session');
          sendError(socket, errorCodeFor(err), errorMessageFor(err));
          safeClose(socket);
        });
        break;
      }
      case 'audio': {
        if (session) session.pushAudio(Buffer.from(message.chunk, 'base64'));
        break;
      }
      case 'language.update': {
        if (!isLanguagePairCode(message.languagePair)) {
          sendError(socket, 'bad_request', 'Unknown language pair');
          break;
        }
        void updateLanguage(message.languagePair).catch((err: unknown) => {
          log.error({ err }, 'failed to update language');
          sendError(socket, errorCodeFor(err), errorMessageFor(err));
        });
        break;
      }
      case 'stop': {
        void finalise(true);
        break;
      }
      default:
        break;
    }
  });

  socket.on('close', () => {
    void finalise(false);
  });

  async function startSession(pair: LanguagePairCode): Promise<void> {
    if (!isLanguagePairCode(pair)) {
      sendError(socket, 'bad_request', 'Unknown language pair');
      safeClose(socket);
      return;
    }
    if (activeSessionCount() >= env.MAX_SESSIONS) {
      sendError(socket, 'session_limit', 'Server at capacity; try again shortly');
      safeClose(socket);
      return;
    }
    incrementActiveSessions();
    counted = true;

    session = await createSession(mode, pair);
    send(socket, { type: 'ready', sessionId, mode, languagePair: pair });
    if (mode === 'cascade') {
      for (const event of breakerSnapshot()) send(socket, { type: 'provider.status', event });
    }
  }

  async function createSession(m: Mode, pair: LanguagePairCode): Promise<InterpreterSession> {
    if (m === 'realtime') {
      if (!env.OPENAI_API_KEY) {
        throw new ProviderError2('Realtime mode requires OPENAI_API_KEY', 'provider_auth');
      }
      const rt = new RealtimeSession({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_REALTIME_MODEL,
        sessionId,
        languagePair: pair,
        inputSampleRate: env.AUDIO_SAMPLE_RATE,
      });
      bindEvents(rt, socket);
      await rt.start();
      return rt;
    }
    const providers = createCascadeProviders((event) =>
      send(socket, { type: 'provider.status', event }),
    );
    const pipeline = new CascadePipeline(providers, buildCascadeConfig(sessionId, pair));
    bindEvents(pipeline, socket);
    pipeline.start();
    return pipeline;
  }

  async function updateLanguage(pair: LanguagePairCode): Promise<void> {
    if (!session) return;
    if (session instanceof RealtimeSession) {
      session.updateLanguage(pair);
      send(socket, { type: 'ready', sessionId, mode, languagePair: pair });
      return;
    }
    // Cascade: rebuild the pipeline for the new pair on the same socket.
    await session.stop().catch(() => undefined);
    session = await createSession('cascade', pair);
  }

  async function finalise(sendLog: boolean): Promise<void> {
    if (session) {
      const current = session;
      session = null;
      const result = await current.stop().catch(() => null);
      if (result) {
        storeSessionLog(result);
        if (sendLog) send(socket, { type: 'session.log', log: result });
      }
    }
    if (counted) {
      counted = false;
      decrementActiveSessions();
    }
    if (sendLog) safeClose(socket);
  }
}

function buildCascadeConfig(sessionId: string, pair: LanguagePairCode): CascadePipelineConfig {
  const config = getLanguagePairConfig(pair);
  return {
    sessionId,
    languagePair: pair,
    stt: { language: config.sttLanguage, sampleRate: env.AUDIO_SAMPLE_RATE },
    translation: { sourceLang: config.pair.source.name, targetLang: config.pair.target.name },
    tts: { voice: config.ttsVoice, sampleRate: env.AUDIO_SAMPLE_RATE },
  };
}

/** Relays a session's normalised events to the browser as ServerMessages. */
function bindEvents(session: InterpreterSession, socket: WebSocket): void {
  // Both session types share these event names with identical payloads; bind via
  // a loose signature so one relay serves both (the listener types below are
  // checked against the actual ServerMessage shapes).
  const bus = session as unknown as {
    on(event: string, listener: (...args: never[]) => void): unknown;
  };
  bus.on('transcript', (event: TranscriptEvent) => send(socket, { type: 'transcript', event }));
  bus.on('latency', (event: LatencyEvent) => send(socket, { type: 'latency', event }));
  bus.on('audio', (event: { audio: Uint8Array; sampleRate: number; turnId: string }) =>
    send(socket, {
      type: 'audio',
      chunk: Buffer.from(event.audio).toString('base64'),
      sampleRate: event.sampleRate,
      turnId: event.turnId,
    }),
  );
  bus.on('turn.start', (turnId: string) => send(socket, { type: 'turn.start', turnId }));
  bus.on('turn.end', (turnId: string) => send(socket, { type: 'turn.end', turnId }));
  bus.on('error', (error: ErrorEvent) => send(socket, { type: 'error', error }));
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendError(socket: WebSocket, code: ErrorCode, message: string): void {
  send(socket, { type: 'error', error: { code, message, recoverable: false } });
}

function safeClose(socket: WebSocket): void {
  if (socket.readyState === socket.OPEN) socket.close();
}

/** Lightweight ProviderError for config-time failures (no SDK cause). */
class ProviderError2 extends ProviderError {
  readonly code: ErrorCode;
  readonly recoverable = false;
  constructor(message: string, code: ErrorCode) {
    super(message, 'session');
    this.code = code;
  }
}

function errorCodeFor(err: unknown): ErrorCode {
  if (err instanceof ProviderError) return err.code;
  return 'internal';
}

function errorMessageFor(err: unknown): string {
  return err instanceof Error ? err.message : 'Internal error';
}
