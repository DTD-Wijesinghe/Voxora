export const OUTPUT_SAMPLE_RATE = 16_000;
export const CHUNK_SAMPLE_COUNT = 1_600;

export interface AudioChunk {
  sequence: number;
  pcm16: ArrayBuffer;
  sampleRate?: number;
}

export type AudioChunkCallback = (chunk: AudioChunk) => void;

export class StreamingResampler {
  private readonly step: number;
  private samples = new Float32Array(0);
  private position = 0;

  public constructor(inputSampleRate: number, outputSampleRate = OUTPUT_SAMPLE_RATE) {
    if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
      throw new RangeError('Input sample rate must be a positive number.');
    }

    this.step = inputSampleRate / outputSampleRate;
  }

  public push(input: Float32Array): Float32Array {
    if (input.length === 0) {
      return new Float32Array(0);
    }

    const combined = new Float32Array(this.samples.length + input.length);
    combined.set(this.samples);
    combined.set(input, this.samples.length);
    this.samples = combined;

    const output: number[] = [];
    while (this.position + 1 < this.samples.length) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      const first = this.samples[index] ?? 0;
      const second = this.samples[index + 1] ?? first;
      output.push(first + (second - first) * fraction);
      this.position += this.step;
    }

    const consumed = Math.floor(this.position);
    if (consumed > 0) {
      this.samples = this.samples.slice(consumed);
      this.position -= consumed;
    }

    return Float32Array.from(output);
  }

  public reset(): void {
    this.samples = new Float32Array(0);
    this.position = 0;
  }
}

export function float32ToPcm16(samples: Float32Array): ArrayBuffer {
  const pcm16 = new ArrayBuffer(samples.length * 2);
  const view = new DataView(pcm16);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const clipped = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
    const value = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
    view.setInt16(index * 2, Math.round(value), true);
  }

  return pcm16;
}

export class PcmChunker {
  private readonly samples = new Float32Array(CHUNK_SAMPLE_COUNT);
  private bufferedSamples = 0;
  private sequence = 0;

  public constructor(private readonly onChunk: AudioChunkCallback) {}

  public push(samples: Float32Array): void {
    let offset = 0;

    while (offset < samples.length) {
      const count = Math.min(CHUNK_SAMPLE_COUNT - this.bufferedSamples, samples.length - offset);
      this.samples.set(samples.subarray(offset, offset + count), this.bufferedSamples);
      this.bufferedSamples += count;
      offset += count;

      if (this.bufferedSamples === CHUNK_SAMPLE_COUNT) {
        this.onChunk({
          sequence: this.sequence,
          pcm16: float32ToPcm16(this.samples),
        });
        this.sequence += 1;
        this.bufferedSamples = 0;
      }
    }
  }

  public reset(): void {
    this.bufferedSamples = 0;
    this.sequence = 0;
  }
}
