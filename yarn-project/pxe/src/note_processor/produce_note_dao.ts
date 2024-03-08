import { L1NotePayload, TxHash } from '@aztec/circuit-types';
import { Fr, PublicKey } from '@aztec/circuits.js';
import { computeCommitmentNonce, siloNullifier } from '@aztec/circuits.js/hash';
import { AcirSimulator } from '@aztec/simulator';

import { NoteDao } from '../database/note_dao.js';
import { ChoppedNoteError } from './chopped_note_error.js';

/**
 * Decodes a note from a transaction that we know was intended for us.
 * Throws if we do not yet have the contract corresponding to the note in our database.
 * Accepts a set of excluded indices, which are indices that have been assigned a note in the same tx.
 * Inserts the index of the note into the excludedIndices set if the note is successfully decoded.
 *
 * @param publicKey - The public counterpart to the private key to be used in note decryption.
 * @param payload - An instance of l1NotePayload.
 * @param txHash - The hash of the transaction that created the note. Equivalent to the first nullifier of the transaction.
 * @param newNoteHashes - New note hashes in this transaction, one of which belongs to this note.
 * @param dataStartIndexForTx - The next available leaf index for the note hash tree for this transaction.
 * @param excludedIndices - Indices that have been assigned a note in the same tx. Notes in a tx can have the same l1NotePayload, we need to find a different index for each replicate.
 * @param simulator - An instance of AcirSimulator.
 * @returns an instance of NoteDao, or throws. inserts the index of the note into the excludedIndices set.
 */
export async function produceNoteDao(
  simulator: AcirSimulator,
  publicKey: PublicKey,
  payload: L1NotePayload,
  txHash: TxHash,
  newNoteHashes: Fr[],
  dataStartIndexForTx: number,
  excludedIndices: Set<number>,
): Promise<NoteDao> {
  const { commitmentIndex, nonce, nonSiloedNoteHash, siloedNullifier } = await findNoteIndexAndNullifier(
    simulator,
    newNoteHashes,
    txHash,
    payload,
    excludedIndices,
  );
  const index = BigInt(dataStartIndexForTx + commitmentIndex);
  excludedIndices.add(commitmentIndex);
  return new NoteDao(
    payload.note,
    payload.contractAddress,
    payload.storageSlot,
    payload.noteTypeId,
    txHash,
    nonce,
    nonSiloedNoteHash,
    siloedNullifier,
    index,
    publicKey,
  );
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
  const firstNullifier = Fr.fromBuffer(txHash.toBuffer());

  // first go through each commitment and see if this note matches up to any
  for (const [commitmentIndex, commitment] of commitments.entries()) {
    if (excludedIndices.has(commitmentIndex)) {
      continue;
    }

    if (commitment.equals(Fr.ZERO)) {
      break;
    }

    const nonce = computeCommitmentNonce(firstNullifier, commitmentIndex);
    const { nonSiloedNoteHash, uniqueSiloedNoteHash, nonSiloedNullifier } = await simulator.computeNoteHashAndNullifier(
      contractAddress,
      nonce,
      storageSlot,
      noteTypeId,
      note,
    );

    if (commitment.equals(uniqueSiloedNoteHash)) {
      return {
        commitmentIndex,
        nonce,
        nonSiloedNoteHash: nonSiloedNoteHash!,
        siloedNullifier: siloNullifier(contractAddress, nonSiloedNullifier!),
      };
    }
  }

  // we couldn't match this note to any commitment
  // check if this note was emitted in public (where nonces are zero)
  // this could happen if we're reprocessing a partial note that was just completed in public
  // remove this once the following issue is resolved
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1386)
  const { siloedNoteHash, nonSiloedNoteHash, nonSiloedNullifier } = await simulator.computeNoteHashAndNullifier(
    contractAddress,
    Fr.ZERO,
    storageSlot,
    noteTypeId,
    note,
  );

  for (const [commitmentIndex, commitment] of commitments.entries()) {
    if (excludedIndices.has(commitmentIndex)) {
      continue;
    }

    if (commitment.equals(Fr.ZERO)) {
      break;
    }

    if (commitment.equals(siloedNoteHash)) {
      return {
        commitmentIndex,
        nonce: Fr.ZERO,
        nonSiloedNoteHash,
        siloedNullifier: siloNullifier(contractAddress, nonSiloedNullifier!),
      };
    }
  }

  // couldn't find a commitment for this note
  throw new ChoppedNoteError(siloedNoteHash);
}
