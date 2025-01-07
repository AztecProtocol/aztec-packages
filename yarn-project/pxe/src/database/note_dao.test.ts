import { NoteDao } from './note_dao.js';

describe('Note DAO', () => {
  it('convert to and from buffer', () => {
    const note = NoteDao.random();
    const buf = note.toBuffer();
    expect(NoteDao.fromBuffer(buf)).toEqual(note);
  });
});
