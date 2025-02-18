use crate::{
    context::PrivateContext,
    note::{note_interface::{NoteInterface, NullifiableNote}, retrieved_note::RetrievedNote},
};

use dep::protocol_types::block_header::BlockHeader;

trait ProveNoteValidity {
    fn prove_note_validity<Note, let N: u32>(
        header: BlockHeader,
        retrieved_note: RetrievedNote<Note>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        Note: NoteInterface<N> + NullifiableNote;
}

impl ProveNoteValidity for BlockHeader {
    fn prove_note_validity<Note, let N: u32>(
        self,
        retrieved_note: RetrievedNote<Note>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        Note: NoteInterface<N> + NullifiableNote,
    {
        self.prove_note_inclusion(retrieved_note, storage_slot);
        self.prove_note_not_nullified(retrieved_note, storage_slot, context);
    }
}

