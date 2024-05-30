import { type L1NotePayload, type TxHash } from '@aztec/circuit-types';
import { Fr, type PublicKey } from '@aztec/circuits.js';
import { computeNoteHashNonce, siloNullifier } from '@aztec/circuits.js/hash';
import { ContractNotFoundError, type AcirSimulator } from '@aztec/simulator';

import { NoteDao } from '../database/note_dao.js';
import { Logger } from '@aztec/foundation/log';
import { DeferredNoteDao } from '../database/deferred_note_dao.js';

/**
 * Decodes a note from a transaction that we know was intended for us.
 * Throws if we do not yet have the contract corresponding to the note in our database.
 * Accepts a set of excluded indices, which are indices that have been assigned a note in the same tx.
 * Inserts the index of the note into the excludedIndices set if the note is successfully decoded.
 *
 * @param ivpkM - The public counterpart to the secret key to be used in the decryption of incoming note logs.
 * @param ovpkM - The public counterpart to the secret key to be used in the decryption of outgoing note logs.
 * @param payload - An instance of l1NotePayload.
 * @param txHash - The hash of the transaction that created the note. Equivalent to the first nullifier of the transaction.
 * @param newNoteHashes - New note hashes in this transaction, one of which belongs to this note.
 * @param dataStartIndexForTx - The next available leaf index for the note hash tree for this transaction.
 * @param excludedIndices - Indices that have been assigned a note in the same tx. Notes in a tx can have the same l1NotePayload, we need to find a different index for each replicate.
 * @param simulator - An instance of AcirSimulator.
 * @returns an instance of NoteDao, or throws. inserts the index of the note into the excludedIndices set.
 */
export async function produceNoteDaos(
  simulator: AcirSimulator,
  ivpkM: PublicKey | undefined,
  ovpkM: PublicKey | undefined,
  payload: L1NotePayload,
  txHash: TxHash,
  newNoteHashes: Fr[],
  dataStartIndexForTx: number,
  excludedIndices: Set<number>,
  log: Logger,
) {
  if (!ivpkM && !ovpkM) {
    throw new Error('Both ivpkM and ovpkM are undefined. Cannot create note.');
  }

  let incomingNoteDao: NoteDao | undefined;
  let outgoingNoteDao: NoteDao | undefined;

  let incomingDeferredNoteDao: DeferredNoteDao | undefined;
  let outgoingDeferredNoteDao: DeferredNoteDao | undefined;

  try {
    const { commitmentIndex, nonce, innerNoteHash, siloedNullifier } = await findNoteIndexAndNullifier(
      simulator,
      newNoteHashes,
      txHash,
      payload,
      excludedIndices,
    );
    const index = BigInt(dataStartIndexForTx + commitmentIndex);
    excludedIndices?.add(commitmentIndex);
    if (ivpkM) {
      incomingNoteDao = new NoteDao(
        payload.note,
        payload.contractAddress,
        payload.storageSlot,
        payload.noteTypeId,
        txHash,
        nonce,
        innerNoteHash,
        siloedNullifier,
        index,
        ivpkM,
      );
    }
    if (ovpkM) {
      outgoingNoteDao = new NoteDao(
        payload.note,
        payload.contractAddress,
        payload.storageSlot,
        payload.noteTypeId,
        txHash,
        nonce,
        innerNoteHash,
        siloedNullifier,
        index,
        ovpkM,
      );
    }
  } catch (e) {
    if (e instanceof ContractNotFoundError) {
      log.warn(e.message);

      if (ivpkM) {
        incomingDeferredNoteDao = new DeferredNoteDao(
          ivpkM,
          payload.note,
          payload.contractAddress,
          payload.storageSlot,
          payload.noteTypeId,
          txHash,
          newNoteHashes,
          dataStartIndexForTx,
        );
      }
      if (ovpkM) {
        outgoingDeferredNoteDao = new DeferredNoteDao(
          ovpkM,
          payload.note,
          payload.contractAddress,
          payload.storageSlot,
          payload.noteTypeId,
          txHash,
          newNoteHashes,
          dataStartIndexForTx,
        );
      }
    } else {
      log.error(`Could not process note because of "${e}". Discarding note...`);
    }
  }

  return {
    incomingNoteDao,
    outgoingNoteDao,
    incomingDeferredNoteDao,
    outgoingDeferredNoteDao,
  };
}

/**
 * Find the index of the note in the note hash tree by computing the note hash with different nonce and see which
 * commitment for the current tx matches this value.
 * Compute a nullifier for a given l1NotePayload.
 * The nullifier is calculated using the private key of the account,
 * contract address, and the note associated with the l1NotePayload.
 * This method assists in identifying spent commitments in the private state.
 * @param commitments - Commitments in the tx. One of them should be the note's commitment.
 * @param txHash - First nullifier in the tx.
 * @param l1NotePayload - An instance of l1NotePayload.
 * @param excludedIndices - Indices that have been assigned a note in the same tx. Notes in a tx can have the same
 * l1NotePayload. We need to find a different index for each replicate.
 * @returns Information for a decrypted note, including the index of its commitment, nonce, inner note
 * hash, and the siloed nullifier. Throw if cannot find the nonce for the note.
 */
async function findNoteIndexAndNullifier(
  simulator: AcirSimulator,
  commitments: Fr[],
  txHash: TxHash,
  { contractAddress, storageSlot, noteTypeId, note }: L1NotePayload,
  excludedIndices: Set<number>,
) {
  let commitmentIndex = 0;
  let nonce: Fr | undefined;
  let innerNoteHash: Fr | undefined;
  let siloedNoteHash: Fr | undefined;
  let innerNullifier: Fr | undefined;
  const firstNullifier = Fr.fromBuffer(txHash.toBuffer());

  for (; commitmentIndex < commitments.length; ++commitmentIndex) {
    if (excludedIndices.has(commitmentIndex)) {
      continue;
    }

    const commitment = commitments[commitmentIndex];
    if (commitment.equals(Fr.ZERO)) {
      break;
    }

    const expectedNonce = computeNoteHashNonce(firstNullifier, commitmentIndex);
    ({ innerNoteHash, siloedNoteHash, innerNullifier } = await simulator.computeNoteHashAndNullifier(
      contractAddress,
      expectedNonce,
      storageSlot,
      noteTypeId,
      note,
    ));

    if (commitment.equals(siloedNoteHash)) {
      nonce = expectedNonce;
      break;
    }
  }

  if (!nonce) {
    // NB: this used to warn the user that a decrypted log didn't match any notes.
    // This was previously fine as we didn't chop transient note logs, but now we do (#1641 complete).
    throw new Error('Cannot find a matching commitment for the note.');
  }

  return {
    commitmentIndex,
    nonce,
    innerNoteHash: innerNoteHash!,
    siloedNullifier: siloNullifier(contractAddress, innerNullifier!),
  };
}
