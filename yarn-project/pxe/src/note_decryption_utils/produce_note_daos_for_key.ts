import { type L1NotePayload, type Note, type TxHash } from '@aztec/circuit-types';
import { type Fr, type PublicKey } from '@aztec/circuits.js';
import { type Logger } from '@aztec/foundation/log';
import { type AcirSimulator } from '@aztec/simulator/client';

import { type PxeDatabase } from '../database/pxe_database.js';
import { getOrderedNoteItems } from './add_public_values_to_payload.js';
import { type NoteInfo, bruteForceNoteInfo } from './brute_force_note_info.js';

export async function produceNoteDaosForKey<T>(
  simulator: AcirSimulator,
  db: PxeDatabase,
  pkM: PublicKey,
  payload: L1NotePayload,
  txHash: TxHash,
  l2BlockNumber: number,
  l2BlockHash: string,
  noteHashes: Fr[],
  dataStartIndexForTx: number,
  excludedIndices: Set<number>,
  logger: Logger,
  daoConstructor: (
    note: Note,
    payload: L1NotePayload,
    noteInfo: NoteInfo,
    l2BlockNumber: number,
    l2BlockHash: string,
    dataStartIndexForTx: number,
    pkM: PublicKey,
  ) => T,
): Promise<T | undefined> {
  let noteDao: T | undefined;

  try {
    // We get the note by merging publicly and privately delivered note values.
    const note = await getOrderedNoteItems(db, payload);

    const noteInfo = await bruteForceNoteInfo(
      simulator,
      noteHashes,
      txHash,
      payload.contractAddress,
      payload.storageSlot,
      payload.noteTypeId,
      note,
      excludedIndices,
      true, // For incoming we compute a nullifier (recipient of incoming is the party that nullifies).
    );
    excludedIndices?.add(noteInfo.noteHashIndex);

    noteDao = daoConstructor(note, payload, noteInfo, l2BlockNumber, l2BlockHash, dataStartIndexForTx, pkM);
  } catch (e) {
    logger.error(`Could not process note because of "${e}". Discarding note...`);
  }

  return noteDao;
}
