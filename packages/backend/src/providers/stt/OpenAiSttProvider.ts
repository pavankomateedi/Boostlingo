/**
 * OpenAI streaming STT provider, using a Realtime *transcription session* over
 * a WebSocket (`?intent=transcription`). This is the default cascade STT when no
 * Deepgram key is present: it pushes PCM-16 frames and receives incremental
 * `...input_audio_transcription.delta` events (mapped to `partial`) and
 * `...completed` events (mapped to `final`). Server VAD provides the end-of-
 * speech signal that sets `speechFinal`.
 */

import WebSocket from 'ws';
import type { ISttProvider, SttConfig, SttEvent } from './ISttProvider.js';
import { AsyncQueue } from '../../lib/asyncQueue.js';
import { classifyProviderError, ProviderConnectionError } from '../errors.js';
import { isForeignScript } from '../../lib/scriptFilter.js';

const REALTIME_TRANSCRIBE_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';

export interface OpenAiSttOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly id?: string;
}

export class OpenAiSttProvider implements ISttProvider {
  readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private socket: WebSocket | null = null;

  constructor(options: OpenAiSttOptions) {
    this.id = options.id ?? 'stt:openai';
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gpt-4o-transcribe';
  }

  async *transcribeStream(
    audioStream: AsyncIterable<Buffer>,
    config: SttConfig,
  ): AsyncIterable<SttEvent> {
    const queue = new AsyncQueue<SttEvent>();
    // GA Realtime API: no OpenAI-Beta header. The legacy `realtime=v1` header
    // makes the server reject the connection as the retired beta API.
    const socket = new WebSocket(REALTIME_TRANSCRIBE_URL, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    this.socket = socket;

    let runningPartial = '';

    socket.on('message', (raw: WebSocket.RawData) => {
      let event: OpenAiRealtimeEvent;
      try {
        event = JSON.parse(raw.toString()) as OpenAiRealtimeEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case 'conversation.item.input_audio_transcription.delta': {
          if (typeof event.delta === 'string' && event.delta.length > 0) {
            runningPartial += event.delta;
            queue.push({ type: 'partial', text: runningPartial, confidence: 0.9 });
          }
          break;
        }
        case 'conversation.item.input_audio_transcription.completed': {
          const text = (event.transcript ?? runningPartial).trim();
          runningPartial = '';
          // Drop hallucinated phantoms in a non-source script (e.g. CJK on a
          // silent/noisy English stream) so they are not shown or translated.
          if (text.length > 0 && !isForeignScript(text, config.language.slice(0, 2))) {
            queue.push({ type: 'final', text, confidence: 0.95, speechFinal: true });
          }
          break;
        }
        case 'error': {
          const msg = event.error?.message ?? 'OpenAI STT error';
          // Benign trailing error: with server VAD the server commits the audio
          // itself, so our end-of-stream commit (needed only when the user stops
          // mid-utterance) finds an empty buffer. Don't surface it as a failure.
          if (/buffer too small|buffer is empty|input_audio_buffer/i.test(msg)) break;
          queue.fail(classifyProviderError(new Error(msg), this.id));
          break;
        }
        default:
          break;
      }
    });

    socket.on('close', () => queue.end());
    socket.on('error', (err) => queue.fail(classifyProviderError(err, this.id)));

    const pump = (async () => {
      try {
        await waitForOpen(socket);
        socket.send(
          JSON.stringify({
            // GA transcription session schema: session.type + nested audio.input.
            type: 'session.update',
            session: {
              type: 'transcription',
              audio: {
                input: {
                  format: { type: 'audio/pcm', rate: config.sampleRate },
                  transcription: {
                    model: config.model ?? this.model,
                    language: config.language.slice(0, 2),
                  },
                  turn_detection: { type: 'server_vad', silence_duration_ms: 300 },
                },
              },
            },
          }),
        );
        for await (const chunk of audioStream) {
          if (socket.readyState !== WebSocket.OPEN) break;
          socket.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: chunk.toString('base64'),
            }),
          );
        }
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          // Give the server a moment to flush the final transcription.
          setTimeout(() => socket.close(), 750);
        }
      } catch (err) {
        queue.fail(classifyProviderError(err, this.id));
      }
    })();

    try {
      yield* queue;
    } finally {
      await pump.catch(() => undefined);
      this.cleanup();
    }
  }

  async close(): Promise<void> {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    this.socket = null;
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ProviderConnectionError('OpenAI STT connection timed out', 'stt:openai')),
      5000,
    );
    socket.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Minimal shape of the Realtime transcription events we read. */
interface OpenAiRealtimeEvent {
  readonly type: string;
  readonly delta?: string;
  readonly transcript?: string;
  readonly error?: { readonly message?: string };
}
