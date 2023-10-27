import { Fr } from '@aztec/circuits.js';
import { ExtendedNote, randomExtendedNote } from '@aztec/types';

import { NoteDao } from './note_dao.js';

export const randomNoteDao = (extendedNoteAttributes: Partial<ExtendedNote> = {}) => {
  const extendedNote = randomExtendedNote(extendedNoteAttributes);
  const nonce = Fr.random();
  const innerNoteHash = Fr.random();
  const siloedNullifier = Fr.random();
  const index = BigInt(0);

  return new NoteDao(extendedNote, nonce, innerNoteHash, siloedNullifier, index);
};

describe('Note DAO', () => {
  it('convert to and from buffer', () => {
    const note = randomNoteDao();
    const buf = note.toBuffer();
    expect(NoteDao.fromBuffer(buf)).toEqual(note);
  });
});
