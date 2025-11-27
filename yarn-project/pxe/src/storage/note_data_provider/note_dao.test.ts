import { NoteDao } from '@aztec/stdlib/note';

describe('Note DAO', () => {
  it('convert to and from buffer', async () => {
    const note = await NoteDao.random();
    const buf = note.toBuffer();
    expect(NoteDao.fromBuffer(buf)).toEqual(note);
  });
});
