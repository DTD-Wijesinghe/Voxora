// Manual check that the configured Gemini credentials can open a translation session.
// Usage: pnpm --filter @voxora/api smoke:gemini
import { config } from 'dotenv';
import { createGeminiTranslationProvider, readGeminiOptions } from '../src/providers/gemini-provider.js';

config({ path: ['.env', '../../.env'], quiet: true });

const targetLanguage = process.argv[2] ?? 'es';
const options = readGeminiOptions(process.env);
console.log(`Connecting to ${options.model} (target: ${targetLanguage})...`);

let live = false;
const session = await createGeminiTranslationProvider(options).start({
  targetLanguage,
  onEvent: (event) => {
    if (event.type === 'status') {
      if (event.status === 'live') live = true;
      console.log(`status: ${event.status}`);
    } else if (event.type === 'error') {
      console.log(`error: ${event.code} - ${event.message}`);
    } else if (event.type !== 'audio') {
      console.log(`${event.type}: ${event.text}`);
    }
  },
});

// One second of silence in 100 ms PCM16 chunks.
for (let chunk = 0; chunk < 10; chunk += 1) {
  await session.sendAudio(new Int16Array(1600).buffer);
  await new Promise((resolve) => setTimeout(resolve, 100));
}

await new Promise((resolve) => setTimeout(resolve, 1500));
await session.close();

console.log(live ? 'OK: Gemini translation session opened.' : 'FAILED: session never reported live.');
process.exitCode = live ? 0 : 1;
