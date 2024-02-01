use crate::{
    context::PrivateContext,
    history::{
        note_inclusion::prove_note_inclusion,
        nullifier_non_inclusion::prove_note_not_nullified,
    },
    note::note_interface::NoteInterface,
};

// A helper function that proves that a note is valid at the given block number
pub fn prove_note_validity<Note, N>(
    note_with_header: Note,
    context: &mut PrivateContext
) where Note: NoteInterface {
    prove_note_inclusion(note_with_header, *context);
    prove_note_not_nullified(note_with_header, context);
}
