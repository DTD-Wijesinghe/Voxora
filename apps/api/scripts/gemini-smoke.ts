// Manual check that the configured Gemini credentials can open a translation session.
// Usage: pnpm --filter @voxora/api smoke:gemini [languageCode] [speech.wav]
// The optional WAV file must be PCM16, 16 kHz, mono.
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { createGeminiTranslationProvider, readGeminiOptions } from '../src/providers/gemini-provider.js';

config({ path: ['.env', '../../.env'], quiet: true });

const targetLanguage = process.argv[2] ?? 'es';
const wavPath = process.argv[3];
const options = readGeminiOptions(process.env);
console.log(`Connecting to ${options.model} (target: ${targetLanguage})...`);

let live = false;
let translatedAudioBytes = 0;
const session = await createGeminiTranslationProvider(options).start({
  targetLanguage,
  onEvent: (event) => {
    if (event.type === 'status') {
      if (event.status === 'live') live = true;
      console.log(`status: ${event.status}`);
    } else if (event.type === 'error') {
      console.log(`error: ${event.code} - ${event.message}`);
    } else if (event.type === 'audio') {
      translatedAudioBytes += event.pcm16.byteLength;
    } else {
      console.log(`${event.type}${event.final ? ' (final)' : ''}: ${event.text}`);
    }
  },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const speech = wavPath ? wavData(readFileSync(wavPath)) : new Uint8Array(0);

// Stream the speech in real time as 100 ms chunks, followed by two seconds of silence.
for (let offset = 0; offset < speech.byteLength; offset += 3200) {
  const chunk = new Uint8Array(3200);
  chunk.set(speech.subarray(offset, offset + 3200));
  await session.sendAudio(chunk.buffer);
  await sleep(100);
}
for (let chunk = 0; chunk < 20; chunk += 1) {
  await session.sendAudio(new Int16Array(1600).buffer);
  await sleep(100);
}

await sleep(wavPath ? 5000 : 1500);
await session.close();

if (wavPath) console.log(`translated audio: ${(translatedAudioBytes / 2 / 24_000).toFixed(1)} s at 24 kHz`);
console.log(live ? 'OK: Gemini translation session opened.' : 'FAILED: session never reported live.');
process.exitCode = live ? 0 : 1;

/** Returns the PCM bytes of a WAV file's "data" chunk. */
function wavData(file: Buffer): Uint8Array {
  let offset = 12;
  while (offset + 8 <= file.length) {
    const id = file.toString('ascii', offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    if (id === 'data') return file.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV file has no data chunk.');
}
