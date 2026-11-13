import { describe, expect, it } from 'vitest';
import { applyTranscriptUpdate } from './caption-utils';

describe('applyTranscriptUpdate', () => {
  it('keeps interim source fragments on one line and finalizes that line', () => {
    let captions = applyTranscriptUpdate([], { direction: 'source', text: 'Good', final: false, speakerName: 'Organizer', language: 'Original' });
    captions = applyTranscriptUpdate(captions, { direction: 'source', text: 'Good morning everyone', final: false, speakerName: 'Organizer', language: 'Original' });
    captions = applyTranscriptUpdate(captions, { direction: 'source', text: 'Good morning everyone.', final: true, speakerName: 'Organizer', language: 'Original' });
    expect(captions).toHaveLength(1);
    expect(captions[0]).toMatchObject({ text: 'Good morning everyone.', final: true });
  });

  it('does not add a duplicate final line', () => {
    let captions = applyTranscriptUpdate([], { direction: 'source', text: 'Hello.', final: true, speakerName: 'Organizer', language: 'Original' });
    captions = applyTranscriptUpdate(captions, { direction: 'source', text: 'Hello.', final: true, speakerName: 'Organizer', language: 'Original' });
    expect(captions).toHaveLength(1);
  });

  it('starts a new line for a new sentence', () => {
    let captions = applyTranscriptUpdate([], { direction: 'source', text: 'First sentence.', final: true, speakerName: 'Organizer', language: 'Original' });
    captions = applyTranscriptUpdate(captions, { direction: 'source', text: 'Second sentence.', final: true, speakerName: 'Organizer', language: 'Original' });
    expect(captions.map((caption) => caption.text)).toEqual(['First sentence.', 'Second sentence.']);
  });
});
