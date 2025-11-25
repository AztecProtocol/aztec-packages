import { NoteDao } from './note_dao.js';

describe('Note DAO', () => {
  it('convert to and from buffer', async () => {
    const note = await NoteDao.random();
    const buf = note.toBuffer();
    expect(NoteDao.fromBuffer(buf)).toEqual(note);
  });

  it('equality check', async () => {
    const noteA = await NoteDao.random();
    const noteB = await NoteDao.random();
    expect(noteA.equals(noteA)).toBe(true);
    expect(noteA.equals(noteB)).toBe(false);
  });
});
