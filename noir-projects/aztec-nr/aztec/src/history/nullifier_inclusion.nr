use dep::protocol_types::abis::block_header::BlockHeader;
use dep::protocol_types::merkle_tree::root::root_from_sibling_path;

use crate::{
    context::PrivateContext,
    note::{
        note_interface::NoteHash, retrieved_note::RetrievedNote,
        utils::compute_siloed_note_nullifier,
    },
    oracle::get_nullifier_membership_witness::get_nullifier_membership_witness,
};
use protocol_types::traits::Hash;

mod test;

pub trait ProveNullifierInclusion {
    fn prove_nullifier_inclusion(header: BlockHeader, nullifier: Field);
}

impl ProveNullifierInclusion for BlockHeader {
    fn prove_nullifier_inclusion(self, nullifier: Field) {
        // 1) Get the membership witness of the nullifier
        // Safety: The witness is only used as a "magical value" that makes the proof below pass. Hence it's safe.
        let witness = unsafe {
            get_nullifier_membership_witness(self.global_variables.block_number, nullifier)
        };

        // 2) First we prove that the tree leaf in the witness is present in the nullifier tree. This is expected to be
        // the leaf that contains the nullifier we're proving inclusion for.
        assert_eq(
            self.state.partial.nullifier_tree.root,
            root_from_sibling_path(witness.leaf_preimage.hash(), witness.index, witness.path),
            "Proving nullifier inclusion failed",
        );

        // 3) Then we simply check that the value in the leaf is the expected one. Note that we don't need to perform
        // any checks on the rest of the values in the leaf preimage (the next index or next nullifier), since all we
        // care about is showing that the tree contains an entry with the expected nullifier.
        assert_eq(
            witness.leaf_preimage.nullifier,
            nullifier,
            "Nullifier does not match value in witness",
        );
    }
}

pub trait ProveNoteIsNullified {
    fn prove_note_is_nullified<Note>(
        header: BlockHeader,
        retrieved_note: RetrievedNote<Note>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        Note: NoteHash;
}

impl ProveNoteIsNullified for BlockHeader {
    // docs:start:prove_note_is_nullified
    fn prove_note_is_nullified<Note>(
        self,
        retrieved_note: RetrievedNote<Note>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        Note: NoteHash,
    {
        let nullifier = compute_siloed_note_nullifier(retrieved_note, storage_slot, context);

        self.prove_nullifier_inclusion(nullifier);
    }
    // docs:end:prove_note_is_nullified
}
