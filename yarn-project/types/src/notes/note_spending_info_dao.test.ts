import { randomNoteSpendingInfoDao } from '../mocks.js';
import { NoteSpendingInfoDao } from './note_spending_info_dao.js';

describe('note_spending_info', () => {
  it('convert to and from buffer', () => {
    const noteSpendingInfoDao = randomNoteSpendingInfoDao();
    const buf = noteSpendingInfoDao.toBuffer();
    expect(NoteSpendingInfoDao.fromBuffer(buf)).toEqual(noteSpendingInfoDao);
  });
});
