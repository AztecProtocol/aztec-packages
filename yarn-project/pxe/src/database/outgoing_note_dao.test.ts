import { OutgoingNoteDao } from './outgoing_note_dao.js';

describe('Outgoing Note DAO', () => {
  it('convert to and from buffer', () => {
    const note = OutgoingNoteDao.random();
    const buf = note.toBuffer();
    expect(OutgoingNoteDao.fromBuffer(buf)).toEqual(note);
  });
});
