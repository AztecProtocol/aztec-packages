import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Note } from '@aztec/stdlib/note';

// TS equivalent of the `NoteMetadata::from_raw_data` function in `aztec/src/note/note_metadata.nr`
function fromRawData(nonzeroNoteHashCounter: boolean, maybeNoteNonce: Fr): { stage: number; maybeNoteNonce: Fr } {
  if (nonzeroNoteHashCounter) {
    if (maybeNoteNonce.equals(Fr.ZERO)) {
      return { stage: 1, maybeNoteNonce }; // PENDING_SAME_PHASE
    } else {
      return { stage: 2, maybeNoteNonce }; // PENDING_PREVIOUS_PHASE
    }
  } else if (!maybeNoteNonce.equals(Fr.ZERO)) {
    return { stage: 3, maybeNoteNonce }; // SETTLED
  } else {
    throw new Error('Note has a zero note hash counter and no nonce - existence cannot be proven');
  }
}

/**
 * Packs a note in a format that is compatible with the default Packable implementation of the hinted note.
 *
 * @dev Unlike the default Packable implementation, this function first constructs the note metadata from the inputs
 * and only after that it packs the hinted note. Hence it doesn't map one to one with `HintedNote::pack()`.
 *
 * @param contractAddress - The address of the contract that owns the note
 * @param owner - The owner of the note
 * @param randomness - The randomness injected into the note to get the hiding property of commitments
 * @param storageSlot - The storage slot of the note
 * @param noteNonce - The nonce injected into the note hash preimage by kernels.
 * @param isPending - True if the note is pending, false if settled
 * @param note - The note content containing the actual note data
 * @returns The packed note as an array of field elements
 */
export function packAsHintedNote({
  contractAddress,
  owner,
  randomness,
  storageSlot,
  noteNonce,
  isPending,
  note,
}: {
  contractAddress: AztecAddress;
  owner: AztecAddress;
  randomness: Fr;
  storageSlot: Fr;
  noteNonce: Fr;
  isPending: boolean;
  note: Note;
}) {
  // If the note is pending it means it has a non-zero note hash counter associated with it.
  const nonZeroNoteHashCounter = isPending;

  // To pack the note as hinted note we first need to reconstruct the note metadata.
  const noteMetadata = fromRawData(nonZeroNoteHashCounter, noteNonce);

  // Pack in order: note, contract_address, owner, randomness, storage_slot, metadata (stage, maybe_note_nonce)
  return [
    ...note.items,
    contractAddress,
    owner,
    randomness,
    storageSlot,
    new Fr(noteMetadata.stage),
    noteMetadata.maybeNoteNonce,
  ];
}
