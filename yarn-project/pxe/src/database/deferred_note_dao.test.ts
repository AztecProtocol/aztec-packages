import { L1NotePayload, UnencryptedTxL2Logs, randomTxHash } from '@aztec/circuit-types';
import { Fr, Point } from '@aztec/circuits.js';
import { randomInt } from '@aztec/foundation/crypto';

import { DeferredNoteDao } from './deferred_note_dao.js';

export const randomDeferredNoteDao = ({
  publicKey = Point.random(),
  payload = L1NotePayload.random(),
  txHash = randomTxHash(),
  noteHashes = [Fr.random(), Fr.random()],
  dataStartIndexForTx = randomInt(100),
  unencryptedLogs = UnencryptedTxL2Logs.random(1, 1),
}: Partial<DeferredNoteDao> = {}) => {
  return new DeferredNoteDao(publicKey, payload, txHash, noteHashes, dataStartIndexForTx, unencryptedLogs);
};

describe('Deferred Note DAO', () => {
  it('convert to and from buffer', () => {
    const deferredNote = randomDeferredNoteDao();
    const buf = deferredNote.toBuffer();
    expect(DeferredNoteDao.fromBuffer(buf)).toEqual(deferredNote);
  });
});
