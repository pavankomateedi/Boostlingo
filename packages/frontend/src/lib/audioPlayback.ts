/**
 * Sequential PCM-16 playback queue. Server audio chunks arrive faster than they
 * play, so each chunk is scheduled to start exactly when the previous one ends,
 * with a small jitter buffer, preventing gaps and overlaps over a long session.
 * Chunks may declare different sample rates (cascade TTS 24 kHz vs realtime
 * 24 kHz vs mock 16 kHz), so each is decoded at its own rate.
 */

const JITTER_SECONDS = 0.12;

export class AudioPlaybackQueue {
  private context: AudioContext | null = null;
  private nextStartTime = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();
  /** Trailing byte held over when a chunk boundary splits a 16-bit sample. */
  private leftover = new Uint8Array(0);

  /** Lazily create/resume the context inside a user gesture. */
  async resume(): Promise<void> {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  /** Decodes and schedules a base64 PCM-16 chunk for gapless playback. */
  enqueue(base64: string, sampleRate: number): void {
    const context = this.context;
    if (!context) return;

    const pcm = this.decodeAligned(base64);
    if (pcm.length === 0) return;

    const buffer = context.createBuffer(1, pcm.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = (pcm[i] ?? 0) / 0x8000;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const now = context.currentTime;
    if (this.nextStartTime < now) this.nextStartTime = now + JITTER_SECONDS;
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  /** Stops all scheduled audio (e.g. on mode switch or stop). */
  clear(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    this.nextStartTime = this.context?.currentTime ?? 0;
    this.leftover = new Uint8Array(0);
  }

  async close(): Promise<void> {
    this.clear();
    await this.context?.close();
    this.context = null;
  }

  /**
   * Decodes a base64 PCM-16 chunk into aligned little-endian samples. The TTS
   * stream is split into network chunks at arbitrary byte offsets, so a chunk
   * can end mid-sample; we carry that trailing byte into the next chunk instead
   * of dropping it. Dropping it shifts every subsequent sample by one byte and
   * turns the audio into high-frequency static.
   */
  private decodeAligned(base64: string): Int16Array {
    const binary = atob(base64);
    const incoming = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) incoming[i] = binary.charCodeAt(i);

    let bytes: Uint8Array;
    if (this.leftover.length > 0) {
      bytes = new Uint8Array(this.leftover.length + incoming.length);
      bytes.set(this.leftover, 0);
      bytes.set(incoming, this.leftover.length);
    } else {
      bytes = incoming;
    }

    const sampleCount = Math.floor(bytes.byteLength / 2);
    const usableBytes = sampleCount * 2;
    this.leftover =
      usableBytes < bytes.byteLength ? bytes.slice(usableBytes) : new Uint8Array(0);

    // Copy the aligned portion into its own buffer so the Int16 view is valid.
    const aligned = bytes.slice(0, usableBytes);
    return new Int16Array(aligned.buffer, 0, sampleCount);
  }
}
