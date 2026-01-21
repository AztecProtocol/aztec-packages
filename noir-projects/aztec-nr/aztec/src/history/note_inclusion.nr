use protocol_types::{
    abis::block_header::BlockHeader,
    hash::{compute_siloed_note_hash, compute_unique_note_hash},
    merkle_tree::root::root_from_sibling_path,
};

use crate::{
    note::{confirmed_note::ConfirmedNote, hinted_note::HintedNote, note_interface::NoteHash},
    oracle::get_membership_witness::get_note_hash_membership_witness,
};

mod test;

pub trait ProveNoteInclusion {
    fn prove_note_inclusion<Note>(
        header: BlockHeader,
        hinted_note: HintedNote<Note>,
    ) -> ConfirmedNote<Note>
    where
        Note: NoteHash;
}

impl ProveNoteInclusion for BlockHeader {
    fn prove_note_inclusion<Note>(self, hinted_note: HintedNote<Note>) -> ConfirmedNote<Note>
    where
        Note: NoteHash,
    {
        let note_hash = hinted_note.note.compute_note_hash(
            hinted_note.owner,
            hinted_note.storage_slot,
            hinted_note.randomness,
        );

        let siloed_note_hash = compute_siloed_note_hash(hinted_note.contract_address, note_hash);

        let unique_note_hash = compute_unique_note_hash(
            hinted_note.metadata.to_settled().note_nonce(),
            siloed_note_hash,
        );

        // Safety: The witness is only used as a "magical value" that makes the merkle proof below pass. Hence it's safe.
        let witness = unsafe { get_note_hash_membership_witness(self, unique_note_hash) };

        // Note inclusion is fairly straightforward, since all we need to prove is that a note exists in the note tree -
        // we don't even care _where_ in the tree it is stored. This is because entries in the note hash tree are
        // unique.
        assert_eq(
            self.state.partial.note_hash_tree.root,
            root_from_sibling_path(unique_note_hash, witness.index, witness.path),
            "Proving note inclusion failed",
        );

        ConfirmedNote::new(hinted_note, unique_note_hash)
    }
}
