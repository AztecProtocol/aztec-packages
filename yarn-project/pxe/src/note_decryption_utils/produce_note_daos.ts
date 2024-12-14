import { type L1NotePayload, type PublicKey, type TxHash } from '@aztec/circuit-types';
import { type Fr } from '@aztec/foundation/fields';
import { type Logger } from '@aztec/foundation/log';
import { type AcirSimulator } from '@aztec/simulator/client';

import { NoteDao } from '../database/note_dao.js';
import { type PxeDatabase } from '../database/pxe_database.js';
import { produceNoteDaosForKey } from './produce_note_daos_for_key.js';

/**
 * Decodes a note from a transaction that we know was intended for us.
 * Throws if we do not yet have the contract corresponding to the note in our database.
 * Accepts a set of excluded indices, which are indices that have been assigned a note in the same tx.
 * Inserts the index of the note into the excludedIndices set if the note is successfully decoded.
 *
 * @param simulator - An instance of AcirSimulator.
 * @param db - An instance of PxeDatabase.
 * @param addressPoint - The public counterpart to the address secret, which is used in the decryption of incoming note logs.
 * @param payload - An instance of l1NotePayload.
 * @param txHash - The hash of the transaction that created the note. Equivalent to the first nullifier of the transaction.
 * @param noteHashes - New note hashes in this transaction, one of which belongs to this note.
 * @param dataStartIndexForTx - The next available leaf index for the note hash tree for this transaction.
 * @param excludedIndices - Indices that have been assigned a note in the same tx. Notes in a tx can have the same l1NotePayload, we need to find a different index for each replicate.
 * @param logger - An instance of Logger.
 * @param unencryptedLogs - Unencrypted logs for the transaction (used to complete partial notes).
 * @returns An object containing the incoming notes.
 */
export async function produceNoteDaos(
  simulator: AcirSimulator,
  db: PxeDatabase,
  addressPoint: PublicKey | undefined,
  payload: L1NotePayload,
  txHash: TxHash,
  l2BlockNumber: number,
  l2BlockHash: string,
  noteHashes: Fr[],
  dataStartIndexForTx: number,
  excludedIndices: Set<number>,
  logger: Logger,
): Promise<{ incomingNote: NoteDao | undefined }> {
  if (!addressPoint) {
    throw new Error('addressPoint is undefined. Cannot create note.');
  }

  let incomingNote: NoteDao | undefined;

  if (addressPoint) {
    incomingNote = await produceNoteDaosForKey(
      simulator,
      db,
      addressPoint,
      payload,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      noteHashes,
      dataStartIndexForTx,
      excludedIndices,
      logger,
      NoteDao.fromPayloadAndNoteInfo,
    );
  }

  return {
    incomingNote,
  };
}
