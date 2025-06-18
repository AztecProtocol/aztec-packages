use crate::{
    context::PrivateContext,
    note::{
        note_interface::NoteHash, retrieved_note::RetrievedNote,
        utils::compute_siloed_note_nullifier,
    },
    oracle::get_nullifier_membership_witness::get_low_nullifier_membership_witness,
};
use dep::protocol_types::{
    block_header::BlockHeader,
    utils::field::{full_field_greater_than, full_field_less_than},
};
use dep::protocol_types::merkle_tree::root::root_from_sibling_path;
use protocol_types::traits::Hash;

mod test;

pub trait ProveNullifierNonInclusion {
    fn prove_nullifier_non_inclusion(header: BlockHeader, nullifier: Field);
}

impl ProveNullifierNonInclusion for BlockHeader {
    fn prove_nullifier_non_inclusion(self, nullifier: Field) {
        // 1) Get the membership witness of a low nullifier of the nullifier
        // Safety: The witness is only used as a "magical value" that makes the proof below pass. Hence it's safe.
        let witness = unsafe {
            get_low_nullifier_membership_witness(self.global_variables.block_number, nullifier)
        };

        // 2) First we prove that the tree leaf in the witness is present in the nullifier tree. This is expected to be
        // the 'low leaf', i.e. the leaf that would come immediately before the nullifier's leaf, if the nullifier were
        // to be in the tree.
        let low_nullifier_leaf = witness.leaf_preimage;
        assert_eq(
            self.state.partial.nullifier_tree.root,
            root_from_sibling_path(low_nullifier_leaf.hash(), witness.index, witness.path),
            "Proving nullifier non-inclusion failed: Could not prove low nullifier inclusion",
        );

        // 3) Prove that the low leaf is indeed smaller than the nullifier
        assert(
            full_field_less_than(low_nullifier_leaf.nullifier, nullifier),
            "Proving nullifier non-inclusion failed: low_nullifier.value < nullifier.value check failed",
        );

        // 4) Prove that the low leaf is pointing "over" the nullifier, which means that the nullifier is not included
        // in the nullifier tree, since if it were it'd need to be between the low leaf and the next leaf. Note the
        // special case in which the low leaf is the largest of all entries, in which case there's no 'next' entry.
        assert(
            full_field_greater_than(low_nullifier_leaf.next_nullifier, nullifier)
                | (low_nullifier_leaf.next_index == 0),
            "Proving nullifier non-inclusion failed: low_nullifier.next_value > nullifier.value check failed",
        );
    }
}

pub trait ProveNoteNotNullified {
    fn prove_note_not_nullified<Note>(
        header: BlockHeader,
        retrieved_note: RetrievedNote<Note>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        Note: NoteHash;
}

impl ProveNoteNotNullified for BlockHeader {
    // docs:start:prove_note_not_nullified
    fn prove_note_not_nullified<Note>(
        self,
        retrieved_note: RetrievedNote<Note>,
        storage_slot: Field,
        context: &mut PrivateContext,
    )
    where
        Note: NoteHash,
    {
        let nullifier = compute_siloed_note_nullifier(retrieved_note, storage_slot, context);

        self.prove_nullifier_non_inclusion(nullifier);
    }
    // docs:end:prove_note_not_nullified
}
