import { OutgoingNoteDao } from './outgoing_note_dao.js';

describe('Outgoing Note DAO', () => {
  it('convert to and from buffer', async () => {
    const note = OutgoingNoteDao.random();
    const buf = (await note).toBuffer();
    expect(OutgoingNoteDao.fromBuffer(buf)).toEqual(note);
  });
});
