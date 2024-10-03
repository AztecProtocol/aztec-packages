import { type L1NotePayload, type TxHash, UnencryptedTxL2Logs } from '@aztec/circuit-types';
import { Fr, type PublicKey } from '@aztec/circuits.js';
import { type Logger } from '@aztec/foundation/log';
import { type AcirSimulator, ContractNotFoundError } from '@aztec/simulator';

import { DeferredNoteDao } from '../database/deferred_note_dao.js';
import { IncomingNoteDao } from '../database/incoming_note_dao.js';
import { OutgoingNoteDao } from '../database/outgoing_note_dao.js';
import { type PxeDatabase } from '../database/pxe_database.js';
import { addNullableFieldsToPayload } from './add_nullable_field_to_payload.js';
import { type NoteInfo, bruteForceNoteInfo } from './find_note_index_and_nullifier.js';

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
  // WARNING: This code is full of tech debt and will be refactored once we have final design of partial notes
  // delivery.
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

  try {
    if (ovpkM) {
      if (incomingNote) {
        // Incoming note is defined meaning that this PXE has both the incoming and outgoing keys. We can skip computing
        // note hash and note index since we already have them in the incoming note.
        outgoingNote = new OutgoingNoteDao(
          payload.note,
          payload.contractAddress,
          payload.storageSlot,
          payload.noteTypeId,
          txHash,
          incomingNote.nonce,
          incomingNote.noteHash,
          incomingNote.index,
          ovpkM,
        );
      } else {
        const noteInfo = await bruteForceNoteInfo(
          simulator,
          noteHashes,
          txHash,
          payload,
          excludedIndices,
          false, // For outgoing we do not compute a nullifier.
        );
        excludedIndices?.add(noteInfo.noteHashIndex);
        outgoingNote = OutgoingNoteDao.fromPayloadAndNoteInfo(payload, noteInfo, dataStartIndexForTx, ovpkM);
      }
    }
  } catch (e) {
    if (e instanceof ContractNotFoundError) {
      logger.warn(e.message);

      if (ovpkM) {
        outgoingDeferredNote = new DeferredNoteDao(
          ovpkM,
          payload.note,
          payload.contractAddress,
          payload.storageSlot,
          payload.noteTypeId,
          txHash,
          noteHashes,
          dataStartIndexForTx,
          unencryptedLogs,
        );
      }
    } else if (
      (e as any).message.includes('failed to solve blackbox function: embedded_curve_add') ||
      (e as any).message.includes('Could not find key prefix.')
    ) {
      // TODO(#8769): This branch is a temporary partial notes delivery solution that should be eventually replaced.
      // Both error messages above occur only when we are dealing with a partial note and are thrown when calling
      // `note.compute_note_hash()` or `note.compute_nullifier_without_context()`
      // in `compute_note_hash_and_optionally_a_nullifier` function. It occurs with partial notes because in the
      // partial flow we receive a note log of a note that is missing some fields here and then we try to compute
      // the note hash with MSM while some of the fields are zeroed out (or get a nsk for zero npk_m_hash).
      for (const functionLogs of unencryptedLogs.functionLogs) {
        for (const log of functionLogs.logs) {
          const { data } = log;
          // It is the expectation that partial notes will have the corresponding unencrypted log be multiple
          // of Fr.SIZE_IN_BYTES as the nullable fields should be simply concatenated.
          if (data.length % Fr.SIZE_IN_BYTES === 0) {
            const nullableFields = [];
            for (let i = 0; i < data.length; i += Fr.SIZE_IN_BYTES) {
              const chunk = data.subarray(i, i + Fr.SIZE_IN_BYTES);
              nullableFields.push(Fr.fromBuffer(chunk));
            }

            // We insert the nullable fields into the note and then we try to produce the note dao again
            const payloadWithNullableFields = await addNullableFieldsToPayload(db, payload, nullableFields);

            try {
              ({ outgoingNote, outgoingDeferredNote } = await produceNoteDaos(
                simulator,
                db,
                undefined, // We only care about outgoing notes in this case as that is where the partial flow got triggered.
                ovpkM,
                payloadWithNullableFields,
                txHash,
                noteHashes,
                dataStartIndexForTx,
                excludedIndices,
                logger,
                UnencryptedTxL2Logs.empty(), // We set unencrypted logs to empty to prevent infinite recursion.
              ));
            } catch (e) {
              if (!(e as any).message.includes('Could not find key prefix.')) {
                throw e;
              }
            }

            if (outgoingNote || outgoingDeferredNote) {
              // We managed to complete the partial note so we terminate the search.
              break;
            }
          }
        }
      }
    } else {
      logger.error(`Could not process note because of "${e}". Discarding note...`);
    }
  }

  return {
    incomingNote,
    outgoingNote,
    incomingDeferredNote,
    outgoingDeferredNote,
  };
}

async function produceNoteDaosForKey<T>(
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
    } else if (
      (e as any).message.includes('failed to solve blackbox function: embedded_curve_add') ||
      (e as any).message.includes('Could not find key prefix.')
    ) {
      // TODO(#8769): This branch is a temporary partial notes delivery solution that should be eventually replaced.
      // Both error messages above occur only when we are dealing with a partial note and are thrown when calling
      // `note.compute_note_hash()` or `note.compute_nullifier_without_context()`
      // in `compute_note_hash_and_optionally_a_nullifier` function. It occurs with partial notes because in the
      // partial flow we receive a note log of a note that is missing some fields here and then we try to compute
      // the note hash with MSM while some of the fields are zeroed out (or get a nsk for zero npk_m_hash).
      for (const functionLogs of unencryptedLogs.functionLogs) {
        for (const log of functionLogs.logs) {
          const { data } = log;
          // It is the expectation that partial notes will have the corresponding unencrypted log be multiple
          // of Fr.SIZE_IN_BYTES as the nullable fields should be simply concatenated.
          if (data.length % Fr.SIZE_IN_BYTES === 0) {
            const nullableFields = [];
            for (let i = 0; i < data.length; i += Fr.SIZE_IN_BYTES) {
              const chunk = data.subarray(i, i + Fr.SIZE_IN_BYTES);
              nullableFields.push(Fr.fromBuffer(chunk));
            }

            // We insert the nullable fields into the note and then we try to produce the note dao again
            const payloadWithNullableFields = await addNullableFieldsToPayload(db, payload, nullableFields);

            try {
              [noteDao, deferredNoteDao] = await produceNoteDaosForKey(
                simulator,
                db,
                pkM,
                payloadWithNullableFields,
                txHash,
                noteHashes,
                dataStartIndexForTx,
                excludedIndices,
                logger,
                UnencryptedTxL2Logs.empty(), // We set unencrypted logs to empty to prevent infinite recursion.
                daoConstructor,
              );
            } catch (e) {
              if (!(e as any).message.includes('Could not find key prefix.')) {
                throw e;
              }
            }

            if (deferredNoteDao) {
              // This should not happen as we should first get contract not found error before the blackbox func error.
              throw new Error('Partial notes should never be deferred.');
            }

            if (noteDao) {
              // We managed to complete the partial note so we terminate the search.
              break;
            }
          }
        }
      }

      if (!noteDao) {
        logger.error(`Partial note note found. Discarding note...`);
      }
    } else {
      logger.error(`Could not process note because of "${e}". Discarding note...`);
    }
  }

  return [noteDao, deferredNoteDao];
}
