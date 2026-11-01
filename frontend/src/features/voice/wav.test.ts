import { describe, expect, it } from "vitest";
import { downsample, encodeWav, rms } from "./wav";

describe("WAV encoding for speech recognition", () => {
  it("writes a valid 16 kHz mono PCM16 header", async () => {
    const blob = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 16000);
    const buf = new DataView(await blob.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => buf.getUint8(o + i)));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(buf.getUint16(22, true)).toBe(1);
    expect(buf.getUint32(24, true)).toBe(16000);
    expect(buf.getUint16(34, true)).toBe(16);
    expect(buf.getUint32(40, true)).toBe(10);
    expect(buf.getInt16(44 + 6, true)).toBe(32767);
    expect(buf.getInt16(44 + 8, true)).toBe(-32768);
    expect(blob.type).toBe("audio/wav");
  });

  it("downsamples 48 kHz to 16 kHz", () => {
    const out = downsample(new Float32Array(48000).fill(0.25), 48000, 16000);
    expect(out.length).toBe(16000);
    expect(out[100]).toBeCloseTo(0.25);
  });

  it("measures loudness", () => {
    expect(rms(new Float32Array(10))).toBe(0);
    expect(rms(new Float32Array(10).fill(0.5))).toBeCloseTo(0.5);
  });
});
