/**
 * Microphone capture controller. Wires getUserMedia -> AudioContext -> the
 * capture AudioWorklet, surfaces an RMS level for the visualizer, and invokes
 * `onChunk` with base64 PCM-16 frames ready to send over the WebSocket. The
 * worklet node is connected through a zero-gain sink so the audio graph pulls
 * from it without echoing the microphone to the speakers.
 */

import { AUDIO_SAMPLE_RATE } from '@workbench/types';
import { getWorkletUrl } from './audioWorklet.js';

export interface AudioCaptureCallbacks {
  readonly onChunk: (base64: string) => void;
  readonly onLevel?: (rms: number) => void;
}

export class AudioCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;

  constructor(
    private readonly callbacks: AudioCaptureCallbacks,
    private readonly targetSampleRate = AUDIO_SAMPLE_RATE,
  ) {}

  /**
   * Requests mic access and starts streaming frames.
   * @throws {DOMException} `NotAllowedError` if the user denies the mic prompt.
   */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    this.context = new AudioContext();
    await this.context.audioWorklet.addModule(getWorkletUrl());

    const source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, 'capture-processor', {
      processorOptions: { targetSampleRate: this.targetSampleRate },
    });

    this.node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      const data = event.data;
      if (data.type === 'audio') {
        this.callbacks.onChunk(arrayBufferToBase64(data.pcm));
        this.callbacks.onLevel?.(data.rms);
      } else {
        this.callbacks.onLevel?.(data.rms);
      }
    };

    // Connect through a muted sink so the worklet runs without audible echo.
    this.sink = this.context.createGain();
    this.sink.gain.value = 0;
    source.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.context.destination);
  }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.node?.disconnect();
    this.sink?.disconnect();
    await this.context?.close();
    this.context = null;
    this.stream = null;
    this.node = null;
    this.sink = null;
  }
}

type WorkletMessage =
  | { type: 'audio'; pcm: ArrayBuffer; rms: number }
  | { type: 'level'; rms: number };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
