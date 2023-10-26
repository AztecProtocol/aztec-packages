import { Fr } from '@aztec/foundation/fields';

import { Note } from './note.js';

describe('note', () => {
  it('convert to and from buffer', () => {
    const fields = Array.from({ length: 5 }).map(() => Fr.random());
    const notePreimage = new Note(fields);
    const buf = notePreimage.toBuffer();
    expect(Note.fromBuffer(buf)).toEqual(notePreimage);
  });
});
