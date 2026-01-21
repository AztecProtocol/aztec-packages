use crate::{
    context::PrivateContext,
    history::{note_inclusion::ProveNoteInclusion, nullifier_non_inclusion::ProveNoteNotNullified},
    note::{hinted_note::HintedNote, note_interface::NoteHash},
};

use protocol_types::abis::block_header::BlockHeader;

mod test;

trait ProveNoteValidity {
    fn prove_note_validity<Note>(
        header: BlockHeader,
        hinted_note: HintedNote<Note>,
        context: &mut PrivateContext,
    )
    where
        Note: NoteHash;
}

impl ProveNoteValidity for BlockHeader {
    fn prove_note_validity<Note>(self, hinted_note: HintedNote<Note>, context: &mut PrivateContext)
    where
        Note: NoteHash,
    {
        let confirmed_note = self.prove_note_inclusion(hinted_note);
        self.prove_note_not_nullified(confirmed_note, context);
    }
}
