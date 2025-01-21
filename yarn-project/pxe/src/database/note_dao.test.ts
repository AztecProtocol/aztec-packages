import { NoteDao } from './note_dao.js';

describe('Note DAO', () => {
  it('convert to and from buffer', async () => {
    const note = await NoteDao.random();
    const buf = note.toBuffer();
    expect(NoteDao.fromBuffer(buf)).toEqual(note);
  });
});
