import { type L1NotePayload, type TxHash, type UnencryptedTxL2Logs } from '@aztec/circuit-types';
import { type Fr, type PublicKey } from '@aztec/circuits.js';
import { type Logger } from '@aztec/foundation/log';
import { type AcirSimulator, ContractNotFoundError } from '@aztec/simulator';

import { DeferredNoteDao } from '../../database/deferred_note_dao.js';
import { type PxeDatabase } from '../../database/pxe_database.js';
import { type NoteInfo, bruteForceNoteInfo } from './brute_force_note_info.js';

export async function produceNoteDaosForKey<T>(
  simulator: AcirSimulator,
  db: PxeDatabase,
  pkM: PublicKey,
  payload: L1NotePayload,
  txHash: TxHash,
  noteHashes: Fr[],
  dataStartIndexForTx: number,
  excludedIndices: Set<number>,
  logger: Logger,
  unencryptedLogs: UnencryptedTxL2Logs,
  daoConstructor: (payload: L1NotePayload, noteInfo: NoteInfo, dataStartIndexForTx: number, pkM: PublicKey) => T,
): Promise<[T | undefined, DeferredNoteDao | undefined]> {
  let noteDao: T | undefined;
  let deferredNoteDao: DeferredNoteDao | undefined;

  try {
    const noteInfo = await bruteForceNoteInfo(
      simulator,
      noteHashes,
      txHash,
      payload,
      excludedIndices,
      true, // For incoming we compute a nullifier (recipient of incoming is the party that nullifies).
    );
    excludedIndices?.add(noteInfo.noteHashIndex);

    noteDao = daoConstructor(payload, noteInfo, dataStartIndexForTx, pkM);
  } catch (e) {
    if (e instanceof ContractNotFoundError) {
      logger.warn(e.message);

      deferredNoteDao = new DeferredNoteDao(
        pkM,
        payload.note,
        payload.contractAddress,
        payload.storageSlot,
        payload.noteTypeId,
        txHash,
        noteHashes,
        dataStartIndexForTx,
        unencryptedLogs,
      );
    } else {
      logger.error(`Could not process note because of "${e}". Discarding note...`);
    }
  }

  return [noteDao, deferredNoteDao];
}
