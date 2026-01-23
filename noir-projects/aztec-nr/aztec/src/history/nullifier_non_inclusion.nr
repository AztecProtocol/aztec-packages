use crate::{
    context::PrivateContext,
    note::{
        ConfirmedNote, note_interface::NoteHash,
        utils::compute_confirmed_note_hash_for_nullification,
    },
    oracle::get_nullifier_membership_witness::get_low_nullifier_membership_witness,
};
use protocol_types::{
    abis::block_header::BlockHeader,
    hash::compute_siloed_nullifier,
    merkle_tree::root::root_from_sibling_path,
    traits::Hash,
    utils::field::{full_field_greater_than, full_field_less_than},
};

mod test;

pub trait ProveNullifierNonInclusion {
    fn prove_nullifier_non_inclusion(header: BlockHeader, nullifier: Field);
}

impl ProveNullifierNonInclusion for BlockHeader {
    fn prove_nullifier_non_inclusion(self, nullifier: Field) {
        // 1) Get the membership witness of a low nullifier of the nullifier
        // Safety: The witness is only used as a "magical value" that makes the proof below pass. Hence it's safe.
        let witness = unsafe { get_low_nullifier_membership_witness(self, nullifier) };

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
        confirmed_note: ConfirmedNote<Note>,
        context: &mut PrivateContext,
    )
    where
        Note: NoteHash;
}

impl ProveNoteNotNullified for BlockHeader {
    fn prove_note_not_nullified<Note>(
        self,
        confirmed_note: ConfirmedNote<Note>,
        context: &mut PrivateContext,
    )
    where
        Note: NoteHash,
    {
        let note_hash_for_nullification =
            compute_confirmed_note_hash_for_nullification(confirmed_note);

        let inner_nullifier = confirmed_note.note.compute_nullifier(
            context,
            confirmed_note.owner,
            note_hash_for_nullification,
        );

        let siloed_nullifier =
            compute_siloed_nullifier(confirmed_note.contract_address, inner_nullifier);

        self.prove_nullifier_non_inclusion(siloed_nullifier);
    }
}
