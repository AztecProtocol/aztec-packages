use dep::std::merkle::compute_merkle_root;

use crate::{
    context::PrivateContext,
    note::{
        utils::compute_siloed_nullifier,
        note_header::NoteHeader,
        note_interface::NoteInterface,
    },
    oracle::get_nullifier_membership_witness::get_low_nullifier_membership_witness,
    utils::{
        full_field_less_than,
        full_field_greater_than,
    },
};

pub fn prove_note_not_nullified<Note, N>(
    note_with_header: Note,
    context: &mut PrivateContext
) where Note: NoteInterface {
    let nullifier = compute_siloed_nullifier(note_with_header, context);

    // 2) Get the membership witness of a low nullifier of the nullifier
    let witness = get_low_nullifier_membership_witness(
        context.historical_header.global_variables.block_number as u32,
        nullifier
    );

    // 3) Prove that the nullifier is not included in the nullifier tree

    // 3.a) Compute the low nullifier leaf and prove that it is in the nullifier tree
    let low_nullifier_leaf = witness.leaf_preimage.hash();
    assert(
        context.historical_header.state.partial.nullifier_tree.root
        == compute_merkle_root(low_nullifier_leaf, witness.index, witness.path), "Proving nullifier non-inclusion failed: Could not prove low nullifier inclusion"
    );

    // 3.b) Prove that the low nullifier is smaller than the nullifier
    assert(
        full_field_less_than(witness.leaf_preimage.nullifier, nullifier), "Proving nullifier non-inclusion failed: low_nullifier.value < nullifier.value check failed"
    );

    // 3.c) Prove that the low nullifier is pointing "over" the nullifier to prove that the nullifier is not
    // included in the nullifier tree (or to 0 if the to-be-inserted nullifier is the largest of all)
    assert(
        full_field_greater_than(witness.leaf_preimage.next_nullifier, nullifier)
        | (witness.leaf_preimage.next_index == 0), "Proving nullifier non-inclusion failed: low_nullifier.next_value > nullifier.value check failed"
    );
    // --> Now we have traversed the trees all the way up to archive root and verified that the nullifier
    //     was not yet included in the nullifier tree.
}
