use crate::{
    context::PrivateContext,
    history::{note_inclusion::ProveNoteInclusion, nullifier_non_inclusion::ProveNoteNotNullified},
    note::{note_interface::NoteHash, retrieved_note::RetrievedNote},
};

use dep::protocol_types::abis::block_header::BlockHeader;

mod test;

trait ProveNoteValidity {
    fn prove_note_validity<Note>(
        header: BlockHeader,
        retrieved_note: RetrievedNote<Note>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        Note: NoteHash;
}

impl ProveNoteValidity for BlockHeader {
    fn prove_note_validity<Note>(
        self,
        retrieved_note: RetrievedNote<Note>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        Note: NoteHash,
    {
        self.prove_note_inclusion(retrieved_note, storage_slot);
        self.prove_note_not_nullified(retrieved_note, storage_slot, context);
    }
}
