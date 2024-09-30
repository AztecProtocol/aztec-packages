import { type L1NotePayload, type TxHash, UnencryptedTxL2Logs } from '@aztec/circuit-types';
import { Fr, type PublicKey } from '@aztec/circuits.js';
import { computeNoteHashNonce, siloNullifier } from '@aztec/circuits.js/hash';
import { type Logger } from '@aztec/foundation/log';
import { type AcirSimulator, ContractNotFoundError } from '@aztec/simulator';

import { DeferredNoteDao } from '../database/deferred_note_dao.js';
import { IncomingNoteDao } from '../database/incoming_note_dao.js';
import { OutgoingNoteDao } from '../database/outgoing_note_dao.js';

/**
 * Decodes a note from a transaction that we know was intended for us.
 * Throws if we do not yet have the contract corresponding to the note in our database.
 * Accepts a set of excluded indices, which are indices that have been assigned a note in the same tx.
 * Inserts the index of the note into the excludedIndices set if the note is successfully decoded.
 *
 * @param simulator - An instance of AcirSimulator.
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

  try {
    if (ivpkM) {
      const { noteHashIndex, nonce, noteHash, siloedNullifier } = await findNoteIndexAndNullifier(
        simulator,
        noteHashes,
        txHash,
        payload,
        excludedIndices,
        true, // For incoming we compute a nullifier (recipient of incoming is the party that nullifies).
      );
      const index = BigInt(dataStartIndexForTx + noteHashIndex);
      excludedIndices?.add(noteHashIndex);

      incomingNote = new IncomingNoteDao(
        payload.note,
        payload.contractAddress,
        payload.storageSlot,
        payload.noteTypeId,
        txHash,
        nonce,
        noteHash,
        siloedNullifier,
        index,
        ivpkM,
      );
    }
  } catch (e) {
    if (e instanceof ContractNotFoundError) {
      logger.warn(e.message);

      if (ivpkM) {
        incomingDeferredNote = new DeferredNoteDao(
          ivpkM,
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
    } else if ((e as any).message.includes('failed to solve blackbox function: embedded_curve_add')) {
      // TODO(#8769): This branch is a temporary partial notes delivery solution that should be eventually replaced.
      // This error occurs when we are dealing with a partial note and is thrown when calling
      // `note.compute_note_hash()` in `compute_note_hash_and_optionally_a_nullifier` function. It occurs with
      // partial notes because in the partial flow we receive a note log of a note that is missing some fields
      // here and then we try to compute the note hash with MSM while some of the fields are zeroed out.
      for (const functionLogs of unencryptedLogs.functionLogs) {
        for (const log of functionLogs.logs) {
          const { data } = log;
          // It is the expectation that partial notes will have the corresponding unencrypted log be multiple
          // of Fr.SIZE_IN_BYTES as the partial fields should be simply concatenated.
          if (data.length % Fr.SIZE_IN_BYTES === 0) {
            const partialFields = [];
            for (let i = 0; i < data.length; i += Fr.SIZE_IN_BYTES) {
              const chunk = data.subarray(i, i + Fr.SIZE_IN_BYTES);
              partialFields.push(Fr.fromBuffer(chunk));
            }

            // We concatenate the partial fields with the rest of the fields of the note and we try to produce
            // the note dao again
            const payloadWithPartialFields = JSON.parse(JSON.stringify(payload));
            payloadWithPartialFields.note.items.push(...partialFields);

            ({ incomingNote, incomingDeferredNote } = await produceNoteDaos(
              simulator,
              ivpkM,
              undefined, // We only care about incoming notes in this case as that is where the partial flow got triggered.
              payloadWithPartialFields,
              txHash,
              noteHashes,
              dataStartIndexForTx,
              excludedIndices,
              logger,
              UnencryptedTxL2Logs.empty(), // We set unencrypted logs to empty to prevent infinite recursion.
            ));
            if (incomingNote || incomingDeferredNote) {
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
        const { noteHashIndex, nonce, noteHash } = await findNoteIndexAndNullifier(
          simulator,
          noteHashes,
          txHash,
          payload,
          excludedIndices,
          false, // For outgoing we do not compute a nullifier.
        );
        const index = BigInt(dataStartIndexForTx + noteHashIndex);
        excludedIndices?.add(noteHashIndex);
        outgoingNote = new OutgoingNoteDao(
          payload.note,
          payload.contractAddress,
          payload.storageSlot,
          payload.noteTypeId,
          txHash,
          nonce,
          noteHash,
          index,
          ovpkM,
        );
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
    } else if ((e as any).message.includes('failed to solve blackbox function: embedded_curve_add')) {
      // TODO(#8769): This branch is a temporary partial notes delivery solution that should be eventually replaced.
      // This error occurs when we are dealing with a partial note and is thrown when calling
      // `note.compute_note_hash()` in `compute_note_hash_and_optionally_a_nullifier` function. It occurs with
      // partial notes because in the partial flow we receive a note log of a note that is missing some fields
      // here and then we try to compute the note hash with MSM while some of the fields are zeroed out.
      for (const functionLogs of unencryptedLogs.functionLogs) {
        for (const log of functionLogs.logs) {
          const { data } = log;
          // It is the expectation that partial notes will have the corresponding unencrypted log be multiple
          // of Fr.SIZE_IN_BYTES as the partial fields should be simply concatenated.
          if (data.length % Fr.SIZE_IN_BYTES === 0) {
            const partialFields = [];
            for (let i = 0; i < data.length; i += Fr.SIZE_IN_BYTES) {
              const chunk = data.subarray(i, i + Fr.SIZE_IN_BYTES);
              partialFields.push(Fr.fromBuffer(chunk));
            }

            // We concatenate the partial fields with the rest of the fields of the note and we try to produce
            // the note dao again
            const payloadWithPartialFields = JSON.parse(JSON.stringify(payload));
            payloadWithPartialFields.note.items.push(...partialFields);

            ({ outgoingNote, outgoingDeferredNote } = await produceNoteDaos(
              simulator,
              undefined, // We only care about outgoing notes in this case as that is where the partial flow got triggered.
              ovpkM,
              payloadWithPartialFields,
              txHash,
              noteHashes,
              dataStartIndexForTx,
              excludedIndices,
              logger,
              UnencryptedTxL2Logs.empty(), // We set unencrypted logs to empty to prevent infinite recursion.
            ));
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

/**
 * Finds nonce, index, inner hash and siloed nullifier for a given note.
 * @dev Finds the index in the note hash tree by computing the note hash with different nonce and see which hash for
 * the current tx matches this value.
 * @remarks This method assists in identifying spent notes in the note hash tree.
 * @param siloedNoteHashes - Note hashes in the tx. One of them should correspond to the note we are looking for
 * @param txHash - Hash of a tx the note was emitted in.
 * @param l1NotePayload - The note payload.
 * @param excludedIndices - Indices that have been assigned a note in the same tx. Notes in a tx can have the same
 * l1NotePayload. We need to find a different index for each replicate.
 * @param computeNullifier - A flag indicating whether to compute the nullifier or just return 0.
 * @returns Nonce, index, inner hash and siloed nullifier for a given note.
 * @throws If cannot find the nonce for the note.
 */
async function findNoteIndexAndNullifier(
  simulator: AcirSimulator,
  siloedNoteHashes: Fr[],
  txHash: TxHash,
  { contractAddress, storageSlot, noteTypeId, note }: L1NotePayload,
  excludedIndices: Set<number>,
  computeNullifier: boolean,
) {
  let noteHashIndex = 0;
  let nonce: Fr | undefined;
  let noteHash: Fr | undefined;
  let siloedNoteHash: Fr | undefined;
  let innerNullifier: Fr | undefined;
  const firstNullifier = Fr.fromBuffer(txHash.toBuffer());

  for (; noteHashIndex < siloedNoteHashes.length; ++noteHashIndex) {
    if (excludedIndices.has(noteHashIndex)) {
      continue;
    }

    const siloedNoteHashFromTxEffect = siloedNoteHashes[noteHashIndex];
    if (siloedNoteHashFromTxEffect.equals(Fr.ZERO)) {
      break;
    }

    const expectedNonce = computeNoteHashNonce(firstNullifier, noteHashIndex);
    ({ noteHash, siloedNoteHash, innerNullifier } = await simulator.computeNoteHashAndOptionallyANullifier(
      contractAddress,
      expectedNonce,
      storageSlot,
      noteTypeId,
      computeNullifier,
      note,
    ));

    if (siloedNoteHashFromTxEffect.equals(siloedNoteHash)) {
      nonce = expectedNonce;
      break;
    }
  }

  if (!nonce) {
    // NB: this used to warn the user that a decrypted log didn't match any notes.
    // This was previously fine as we didn't chop transient note logs, but now we do (#1641 complete).
    throw new Error('Cannot find a matching note hash for the note.');
  }

  return {
    noteHashIndex,
    nonce,
    noteHash: noteHash!,
    siloedNullifier: siloNullifier(contractAddress, innerNullifier!),
  };
}
