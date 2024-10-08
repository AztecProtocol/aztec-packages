import { type L1NotePayload, type TxHash, UnencryptedTxL2Logs } from '@aztec/circuit-types';
import { Fr, type PublicKey } from '@aztec/circuits.js';
import { type Logger } from '@aztec/foundation/log';
import { type AcirSimulator, ContractNotFoundError } from '@aztec/simulator';

import { DeferredNoteDao } from '../../database/deferred_note_dao.js';
import { type PxeDatabase } from '../../database/pxe_database.js';
import { addNullableFieldsToPayload } from './add_nullable_field_to_payload.js';
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
      noteDao = await handlePartialNote(
        simulator,
        db,
        pkM,
        payload,
        txHash,
        noteHashes,
        dataStartIndexForTx,
        excludedIndices,
        logger,
        unencryptedLogs,
        daoConstructor,
      );
    } else {
      logger.error(`Could not process note because of "${e}". Discarding note...`);
    }
  }

  return [noteDao, deferredNoteDao];
}

async function handlePartialNote<T>(
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
): Promise<T | undefined> {
  let noteDao: T | undefined;

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

        let deferredNoteDao: DeferredNoteDao | undefined;
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
          // We ignore the key prefix error because that is expected to be triggered when an incorrect value
          // is inserted at the position of `npk_m_hash`. This happens commonly because we are brute forcing
          // the unencrypted logs.
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

  return noteDao;
}
