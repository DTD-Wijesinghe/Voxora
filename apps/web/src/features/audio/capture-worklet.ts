declare abstract class AudioWorkletProcessor {
  public readonly port: MessagePort;

  public constructor();

  public abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processor: new (...args: never[]) => AudioWorkletProcessor,
): void;

class MicrophoneCaptureProcessor extends AudioWorkletProcessor {
  public process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel !== undefined && channel.length > 0) {
      const samples = channel.slice();
      this.port.postMessage(samples, [samples.buffer]);
    }

    for (const output of outputs[0] ?? []) {
      output.fill(0);
    }

    return true;
  }
}

registerProcessor('voxora-microphone-capture', MicrophoneCaptureProcessor);
