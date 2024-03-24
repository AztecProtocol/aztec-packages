import { Note, randomTxHash } from '@aztec/circuit-types';
import { AztecAddress, Fr, Point } from '@aztec/circuits.js';

import { DeferredNoteDao } from './deferred_note_dao.js';

export const randomDeferredNoteDao = ({
  publicKey = Point.random(),
  note = Note.random(),
  contractAddress = AztecAddress.random(),
  txHash = randomTxHash(),
  storageSlot = Fr.random(),
  noteTypeId = Fr.random(),
  newNoteHashes = [Fr.random(), Fr.random()],
  dataStartIndexForTx = Math.floor(Math.random() * 100),
}: Partial<DeferredNoteDao> = {}) => {
  return new DeferredNoteDao(
    publicKey,
    note,
    contractAddress,
    storageSlot,
    noteTypeId,
    txHash,
    newNoteHashes,
    dataStartIndexForTx,
  );
};

describe('Deferred Note DAO', () => {
  it('convert to and from buffer', () => {
    const deferredNote = randomDeferredNoteDao();
    const buf = deferredNote.toBuffer();
    expect(DeferredNoteDao.fromBuffer(buf)).toEqual(deferredNote);
  });
});
