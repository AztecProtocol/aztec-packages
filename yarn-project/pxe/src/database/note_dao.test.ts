import { Fr, Point } from '@aztec/circuits.js';
import { randomExtendedNote } from '@aztec/types';

import { NoteDao } from './note_dao.js';

const randomNoteDao = () => {
  const extendedNote = randomExtendedNote();
  const nonce = Fr.random();
  const innerNoteHash = Fr.random();
  const siloedNullifier = Fr.random();
  const index = BigInt(0);
  const publicKey = Point.random();

  return new NoteDao(extendedNote, nonce, innerNoteHash, siloedNullifier, index, publicKey);
};

describe('Note DAO', () => {
  it('convert to and from buffer', () => {
    const note = randomNoteDao();
    const buf = note.toBuffer();
    expect(NoteDao.fromBuffer(buf)).toEqual(note);
  });
});
