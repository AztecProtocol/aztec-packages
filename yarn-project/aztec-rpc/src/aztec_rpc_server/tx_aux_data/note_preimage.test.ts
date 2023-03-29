import { Fr } from '@aztec/foundation/fields';
import { NotePreImage } from './note_preimage.js';

describe('note_preimage', () => {
  it('convert to and from buffer', () => {
    const fields = Array.from({ length: 5 }).map(() => Fr.random());
    const notePreImage = new NotePreImage(fields);
    const buf = notePreImage.toBuffer();
    expect(NotePreImage.fromBuffer(buf)).toEqual(notePreImage);
  });
});
