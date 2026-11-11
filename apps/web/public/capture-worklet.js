class MicrophoneCaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
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
