import { randomExtendedNote, randomExtendedNoteWithNonce } from '../mocks.js';
import { ExtendedNote, ExtendedNoteWithNonce } from './extended_note.js';

describe('Extended Note', () => {
  it('convert to and from buffer', () => {
    const extendedNote = randomExtendedNote();
    const buf = extendedNote.toBuffer();
    expect(ExtendedNote.fromBuffer(buf)).toEqual(extendedNote);
  });
});

describe('Extended Note with nonce', () => {
  it('convert to and from buffer', () => {
    const extendedNote = randomExtendedNoteWithNonce();
    const buf = extendedNote.toBuffer();
    expect(ExtendedNoteWithNonce.fromBuffer(buf)).toEqual(extendedNote);
  });
});
