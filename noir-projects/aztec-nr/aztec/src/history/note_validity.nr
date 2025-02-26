use crate::{
    context::PrivateContext,
    note::{note_interface::NoteHash, retrieved_note::RetrievedNote},
};

use dep::protocol_types::block_header::BlockHeader;

trait ProveNoteValidity {
    fn prove_note_validity<NOTE>(
        header: BlockHeader,
        retrieved_note: RetrievedNote<NOTE>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        NOTE: NoteHash;
}

impl ProveNoteValidity for BlockHeader {
    fn prove_note_validity<NOTE>(
        self,
        retrieved_note: RetrievedNote<NOTE>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        NOTE: NoteHash,
    {
        self.prove_note_inclusion(retrieved_note, storage_slot);
        self.prove_note_not_nullified(retrieved_note, storage_slot, context);
    }
}
