import { NoteDao } from './note_dao.js';

describe('NoteDao', () => {
  it('convert to and from buffer', async () => {
    const note = await NoteDao.random();
    const buf = note.toBuffer();
    expect(NoteDao.fromBuffer(buf)).toEqual(note);
  });

  it('reports the serialized size', async () => {
    const note = await NoteDao.random();

    expect(note.getSize()).toBe(note.toBuffer().length);
  });

  describe('equals', () => {
    it('returns true for identical NoteDao instances', async () => {
      const note1 = await NoteDao.random();
      const note2 = NoteDao.fromBuffer(note1.toBuffer());

      expect(note1.equals(note2)).toBe(true);
      expect(note2.equals(note1)).toBe(true);
    });

    it('returns false when note differs', async () => {
      const note1 = await NoteDao.random();
      const note2 = await NoteDao.random();

      expect(note1.equals(note2)).toBe(false);
    });
  });
});
