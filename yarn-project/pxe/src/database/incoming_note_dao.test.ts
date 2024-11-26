import { IncomingNoteDao } from './incoming_note_dao.js';

describe('Incoming Note DAO', () => {
  it('convert to and from buffer', () => {
    const note = IncomingNoteDao.random();
    const buf = note.toBuffer();
    expect(IncomingNoteDao.fromBuffer(buf)).toEqual(note);
  });
});
