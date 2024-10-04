import { type L1NotePayload, type TxHash } from '@aztec/circuit-types';
import { computeNoteHashNonce, siloNullifier } from '@aztec/circuits.js/hash';
import { Fr } from '@aztec/foundation/fields';
import { type AcirSimulator } from '@aztec/simulator';

export interface NoteInfo {
  noteHashIndex: number;
  nonce: Fr;
  noteHash: Fr;
  siloedNullifier: Fr;
  txHash: TxHash;
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
export async function bruteForceNoteInfo(
  simulator: AcirSimulator,
  siloedNoteHashes: Fr[],
  txHash: TxHash,
  { contractAddress, storageSlot, noteTypeId, note }: L1NotePayload,
  excludedIndices: Set<number>,
  computeNullifier: boolean,
): Promise<NoteInfo> {
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
    txHash,
  };
}
