/**
 * Environment configuration, validated once at startup with zod.
 *
 * Importing `env` from this module guarantees every value is present and
 * correctly typed — a missing or malformed variable fails fast at boot rather
 * than surfacing as an opaque runtime error mid-session. API keys are optional
 * at the schema level so the server can boot and serve mock providers without
 * any keys; a provider that needs a missing key throws a clear error only when
 * that provider is actually selected.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load the repo-root .env (two levels up from packages/backend at runtime) and
// a package-local .env, without overriding already-set process env.
const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, '../../../../.env') });
loadDotenv();

const boolish = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true');

const envSchema = z.object({
  // ── API keys (optional: enables mock-only boot) ──
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),

  // ── Models ──
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime'),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('gpt-4o-transcribe'),
  OPENAI_TTS_MODEL: z.string().default('tts-1'),
  CLAUDE_MODEL: z.string().default('claude-haiku-4-5'),
  DEEPGRAM_MODEL: z.string().default('nova-2'),

  // ── Default provider selection for cascade mode ──
  STT_PROVIDER: z.enum(['openai', 'deepgram', 'mock']).default('openai'),
  TRANSLATION_PROVIDER: z.enum(['claude', 'openai', 'mock']).default('claude'),
  TTS_PROVIDER: z.enum(['openai', 'mock']).default('openai'),

  // ── Latency thresholds (ms) ──
  LATENCY_THRESHOLD_REALTIME_MS: z.coerce.number().default(1500),
  LATENCY_THRESHOLD_CASCADE_MS: z.coerce.number().default(3000),
  LATENCY_THRESHOLD_STT_FIRST_WORD_MS: z.coerce.number().default(400),
  LATENCY_THRESHOLD_TRANSLATION_FIRST_TOKEN_MS: z.coerce.number().default(300),
  LATENCY_THRESHOLD_TTS_FIRST_CHUNK_MS: z.coerce.number().default(300),

  // ── Server ──
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:4173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(60),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ── Circuit breaker ──
  CIRCUIT_BREAKER_ENABLED: boolish(true),
  CIRCUIT_BREAKER_ERROR_THRESHOLD: z.coerce.number().default(5),
  CIRCUIT_BREAKER_WINDOW_SECONDS: z.coerce.number().default(60),
  CIRCUIT_BREAKER_OPEN_DURATION_SECONDS: z.coerce.number().default(30),

  // ── Session & audio ──
  MAX_SESSIONS: z.coerce.number().default(50),
  AUDIO_CHUNK_MS: z.coerce.number().default(100),
  AUDIO_SAMPLE_RATE: z.coerce.number().default(24000),
  TTS_JITTER_BUFFER_CHUNKS: z.coerce.number().default(3),
  TTS_MAX_QUEUE_SIZE: z.coerce.number().default(5),

  // ── Feature flags ──
  ADMIN_ENDPOINTS_ENABLED: boolish(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;

/** Per-stage latency thresholds, used for both UI colour coding and CI gates. */
export const latencyThresholds = {
  realtimeE2e: env.LATENCY_THRESHOLD_REALTIME_MS,
  cascadeE2e: env.LATENCY_THRESHOLD_CASCADE_MS,
  sttFirstWord: env.LATENCY_THRESHOLD_STT_FIRST_WORD_MS,
  translationFirstToken: env.LATENCY_THRESHOLD_TRANSLATION_FIRST_TOKEN_MS,
  ttsFirstChunk: env.LATENCY_THRESHOLD_TTS_FIRST_CHUNK_MS,
} as const;
