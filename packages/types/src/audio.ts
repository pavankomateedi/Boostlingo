/**
 * Audio format constants shared between the browser AudioWorklet capture path
 * and the backend provider adapters. The OpenAI Realtime GA API (both the
 * speech-to-speech and transcription sessions) rejects an input format rate
 * below 24 kHz, so 24 kHz mono PCM-16 is the canonical format the workbench
 * captures, transports, and plays back. (Deepgram accepts this rate too.)
 */

/** Sample rate (Hz) for all captured and synthesised audio. */
export const AUDIO_SAMPLE_RATE = 24_000;

/** Number of channels. Interpretation audio is always mono. */
export const AUDIO_CHANNELS = 1;

/** Bit depth of the PCM samples sent over the wire. */
export const AUDIO_BIT_DEPTH = 16;

/** Size of each audio chunk emitted by the capture worklet, in milliseconds. */
export const AUDIO_CHUNK_MS = 100;

/** Samples per chunk at the canonical sample rate (24000 * 0.1 = 2400). */
export const AUDIO_SAMPLES_PER_CHUNK = (AUDIO_SAMPLE_RATE * AUDIO_CHUNK_MS) / 1000;
