/**
 * Records one short spoken answer from the group.
 *
 * The microphone is opened only while recording and released immediately
 * afterwards, so the UI can truthfully say "listening" only when it is.
 * Audio stays in memory and is sent once to the backend for transcription;
 * it is never stored.
 */
import { downsample, encodeWav, rms } from "./wav";

export interface RecorderOptions {
  maxSeconds?: number;
  silenceStopSeconds?: number;
  onLevel?: (level: number) => void;
}

export interface Recording {
  blob: Blob;
  seconds: number;
  heardSpeech: boolean;
}

export class MicUnavailableError extends Error {}

export function micSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}

export class AnswerRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private resolve: ((r: Recording) => void) | null = null;
  private timer: number | null = null;
  private started = 0;
  private lastLoud = 0;
  private heard = false;

  async start(opts: RecorderOptions = {}): Promise<Recording> {
    const { maxSeconds = 7, silenceStopSeconds = 1.4, onLevel } = opts;
    if (!micSupported()) throw new MicUnavailableError("This device cannot record audio.");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      throw new MicUnavailableError("Microphone permission was not given.");
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.started = performance.now();
    this.lastLoud = this.started;
    this.heard = false;

    this.node.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      this.chunks.push(data);
      const level = rms(data);
      onLevel?.(Math.min(1, level * 6));
      const now = performance.now();
      if (level > 0.03) {
        this.heard = true;
        this.lastLoud = now;
      }
      if (this.heard && now - this.lastLoud > silenceStopSeconds * 1000) this.stop();
    };
    source.connect(this.node);
    this.node.connect(this.ctx.destination);
    this.timer = window.setTimeout(() => this.stop(), maxSeconds * 1000);
    return new Promise<Recording>((res) => (this.resolve = res));
  }

  stop() {
    if (!this.ctx || !this.resolve) return;
    const rate = this.ctx.sampleRate;
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) {
      merged.set(c, o);
      o += c.length;
    }
    const pcm16k = downsample(merged, rate, 16000);
    const result: Recording = { blob: encodeWav(pcm16k, 16000), seconds: total / rate, heardSpeech: this.heard };
    const done = this.resolve;
    this.cleanup();
    done(result);
  }

  cancel() {
    this.cleanup();
  }

  private cleanup() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
    this.chunks = [];
    this.resolve = null;
  }
}
