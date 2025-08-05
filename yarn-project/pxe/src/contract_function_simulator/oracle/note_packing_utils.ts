import { Fr } from '@aztec/foundation/fields';
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

export function packAsRetrievedNote({
  contractAddress,
  noteNonce,
  index,
  note: noteContent,
}: {
  contractAddress: AztecAddress;
  noteNonce: Fr;
  index?: bigint;
  note: Note;
}) {
  // If index is undefined, the note is transient which implies that the nonzero_note_hash_counter has to be true
  const noteIsTransient = index === undefined;
  const nonzeroNoteHashCounter = noteIsTransient ? true : false;

  // To pack the note as retrieved note we first need to reconstruct the note metadata.
  const noteMetadata = fromRawData(nonzeroNoteHashCounter, noteNonce);

  // Pack metadata first (stage and maybe_note_nonce), followed by the rest
  return [...noteContent.items, contractAddress, new Fr(noteMetadata.stage), noteMetadata.maybeNoteNonce];
}
