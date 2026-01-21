use protocol_types::{abis::block_header::BlockHeader, merkle_tree::root::root_from_sibling_path};

use crate::{
    note::{
        hinted_note::HintedNote, note_interface::NoteHash, utils::compute_settled_note_unique_hash,
    },
    oracle::get_membership_witness::get_note_hash_membership_witness,
};

mod test;

pub trait ProveNoteInclusion {
    fn prove_note_inclusion<Note>(header: BlockHeader, hinted_note: HintedNote<Note>)
    where
        Note: NoteHash;
}

impl ProveNoteInclusion for BlockHeader {
    fn prove_note_inclusion<Note>(self, hinted_note: HintedNote<Note>)
    where
        Note: NoteHash,
    {
        let note_hash = compute_settled_note_unique_hash(hinted_note);

        // Safety: The witness is only used as a "magical value" that makes the merkle proof below pass. Hence it's safe.
        let witness = unsafe { get_note_hash_membership_witness(self, note_hash) };

        // Note inclusion is fairly straightforward, since all we need to prove is that a note exists in the note tree -
        // we don't even care _where_ in the tree it is stored. This is because entries in the note hash tree are
        // unique.
        assert_eq(
            self.state.partial.note_hash_tree.root,
            root_from_sibling_path(note_hash, witness.index, witness.path),
            "Proving note inclusion failed",
        );
    }
}
