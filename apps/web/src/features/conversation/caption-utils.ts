import type { Caption } from '../../types';

export interface TranscriptUpdate {
  direction: Caption['direction'];
  text: string;
  final: boolean;
  speakerName: string;
  language: string;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function mergeText(previous: string, next: string): string {
  const oldText = previous.trim();
  const newText = next.trim();
  if (!oldText) return newText;
  if (!newText) return oldText;
  if (newText.startsWith(oldText)) return newText;
  if (oldText.startsWith(newText)) return oldText;
  return `${oldText} ${newText}`.replace(/\s+/g, ' ');
}

/** Keeps interim provider fragments on one line and ignores duplicate final fragments. */
export function applyTranscriptUpdate(captions: Caption[], update: TranscriptUpdate): Caption[] {
  const text = update.text.trim();
  if (!text) return captions;
  const last = captions.at(-1);
  if (last?.direction === update.direction) {
    if (last.final && update.final && normalize(last.text) === normalize(text)) return captions;
    if (!last.final) {
      const merged: Caption = {
        ...last,
        speakerName: update.speakerName,
        language: update.language,
        text: mergeText(last.text, text),
        final: update.final,
      };
      return [...captions.slice(0, -1), merged];
    }
  }
  return [...captions.slice(-19), {
    id: crypto.randomUUID(),
    speakerName: update.speakerName,
    language: update.language,
    text,
    final: update.final,
    direction: update.direction,
  }];
}
