import { type L1NotePayload, type PublicKey, type TxHash, type UnencryptedTxL2Logs } from '@aztec/circuit-types';
import { type Fr } from '@aztec/foundation/fields';
import { type Logger } from '@aztec/foundation/log';
import { type AcirSimulator } from '@aztec/simulator';

import { type DeferredNoteDao } from '../../database/deferred_note_dao.js';
import { IncomingNoteDao } from '../../database/incoming_note_dao.js';
import { OutgoingNoteDao } from '../../database/outgoing_note_dao.js';
import { type PxeDatabase } from '../../database/pxe_database.js';
import { produceNoteDaosForKey } from './produce_note_daos_for_key.js';

/**
 * Decodes a note from a transaction that we know was intended for us.
 * Throws if we do not yet have the contract corresponding to the note in our database.
 * Accepts a set of excluded indices, which are indices that have been assigned a note in the same tx.
 * Inserts the index of the note into the excludedIndices set if the note is successfully decoded.
 *
 * @param simulator - An instance of AcirSimulator.
 * @param db - An instance of PxeDatabase.
 * @param ivpkM - The public counterpart to the secret key to be used in the decryption of incoming note logs.
 * @param ovpkM - The public counterpart to the secret key to be used in the decryption of outgoing note logs.
 * @param payload - An instance of l1NotePayload.
 * @param txHash - The hash of the transaction that created the note. Equivalent to the first nullifier of the transaction.
 * @param noteHashes - New note hashes in this transaction, one of which belongs to this note.
 * @param dataStartIndexForTx - The next available leaf index for the note hash tree for this transaction.
 * @param excludedIndices - Indices that have been assigned a note in the same tx. Notes in a tx can have the same l1NotePayload, we need to find a different index for each replicate.
 * @param logger - An instance of Logger.
 * @param unencryptedLogs - Unencrypted logs for the transaction (used to complete partial notes).
 * @returns An object containing the incoming, outgoing, and deferred notes.
 */
export async function produceNoteDaos(
  simulator: AcirSimulator,
  db: PxeDatabase,
  ivpkM: PublicKey | undefined,
  ovpkM: PublicKey | undefined,
  payload: L1NotePayload,
  txHash: TxHash,
  noteHashes: Fr[],
  dataStartIndexForTx: number,
  excludedIndices: Set<number>,
  logger: Logger,
  unencryptedLogs: UnencryptedTxL2Logs,
): Promise<{
  incomingNote: IncomingNoteDao | undefined;
  outgoingNote: OutgoingNoteDao | undefined;
  incomingDeferredNote: DeferredNoteDao | undefined;
  outgoingDeferredNote: DeferredNoteDao | undefined;
}> {
  if (!ivpkM && !ovpkM) {
    throw new Error('Both ivpkM and ovpkM are undefined. Cannot create note.');
  }

  let incomingNote: IncomingNoteDao | undefined;
  let outgoingNote: OutgoingNoteDao | undefined;
  let incomingDeferredNote: DeferredNoteDao | undefined;
  let outgoingDeferredNote: DeferredNoteDao | undefined;

  if (ivpkM) {
    [incomingNote, incomingDeferredNote] = await produceNoteDaosForKey(
      simulator,
      db,
      ivpkM,
      payload,
      txHash,
      noteHashes,
      dataStartIndexForTx,
      excludedIndices,
      logger,
      unencryptedLogs,
      IncomingNoteDao.fromPayloadAndNoteInfo,
    );
  }

  if (ovpkM) {
    if (incomingNote) {
      // Incoming note is defined meaning that this PXE has both the incoming and outgoing keys. We can skip computing
      // note hash and note index since we already have them in the incoming note.
      outgoingNote = new OutgoingNoteDao(
        incomingNote.note,
        incomingNote.contractAddress,
        incomingNote.storageSlot,
        incomingNote.noteTypeId,
        incomingNote.txHash,
        incomingNote.nonce,
        incomingNote.noteHash,
        incomingNote.index,
        ovpkM,
      );
    } else {
      [outgoingNote, outgoingDeferredNote] = await produceNoteDaosForKey(
        simulator,
        db,
        ovpkM,
        payload,
        txHash,
        noteHashes,
        dataStartIndexForTx,
        excludedIndices,
        logger,
        unencryptedLogs,
        OutgoingNoteDao.fromPayloadAndNoteInfo,
      );
    }
  }

  return {
    incomingNote,
    outgoingNote,
    incomingDeferredNote,
    outgoingDeferredNote,
  };
}
