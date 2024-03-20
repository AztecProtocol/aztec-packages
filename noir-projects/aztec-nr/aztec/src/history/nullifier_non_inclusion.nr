use dep::std::merkle::compute_merkle_root;
use dep::protocol_types::{header::Header, utils::field::{full_field_less_than, full_field_greater_than}};
use crate::{
    context::PrivateContext, note::{utils::compute_siloed_nullifier, note_interface::NoteInterface},
    oracle::get_nullifier_membership_witness::{get_low_nullifier_membership_witness, NullifierMembershipWitness}
};

/**
 * This function checks if a nullifier is NOT included in the nullifier tree at a given header.
 * IMPORTANT: If the function returns false, you don't have a proof of inclusion.
 *
 * @param nullifier The nullifier to prove NON inclusion of
 * @param header The header at which we'll prove that the nullifier NOT exists in the nullifier tree
 * @return true if the nullifier is NOT included in the nullifier tree, false otherwise
 */
pub fn nullifier_valid_non_inclusion(nullifier: Field, header: Header) -> bool {
    // 1) Get the membership witness of a low nullifier of the nullifier
    Option::some(get_low_nullifier_membership_witness(header.global_variables.block_number as u32, nullifier))
    // 3) Prove that the nullifier is not included in the nullifier tree
    // 3.a) Compute the low nullifier leaf and prove that it is in the nullifier tree
    .filter(|witness: NullifierMembershipWitness| {
        let low_nullifier_leaf = witness.leaf_preimage.hash();
        header.state.partial.nullifier_tree.root
        == compute_merkle_root(low_nullifier_leaf, witness.index, witness.path)
    })
    // 3.b) Prove that the low nullifier is smaller than the nullifier
    .filter(|witness: NullifierMembershipWitness| full_field_less_than(witness.leaf_preimage.nullifier, nullifier))
    // 3.c) Prove that the low nullifier is pointing "over" the nullifier to prove that the nullifier is not
    // included in the nullifier tree (or to 0 if the to-be-inserted nullifier is the largest of all)
    .filter(|witness: NullifierMembershipWitness|
        full_field_greater_than(witness.leaf_preimage.next_nullifier, nullifier)
        | (witness.leaf_preimage.next_index == 0)
    )
    // --> Now we have traversed the trees all the way up to archive root and verified that the nullifier
    //     was not yet included in the nullifier tree.
    .is_some()
}

pub fn prove_nullifier_not_included(nullifier: Field, context: PrivateContext) {
    assert(nullifier_valid_non_inclusion(nullifier, context.historical_header), "Proving nullifier non-inclusion failed!");
}

pub fn prove_nullifier_not_included_at(nullifier: Field, block_number: u32, context: PrivateContext) {
    let header = context.get_header_at(block_number);

    assert(nullifier_valid_non_inclusion(nullifier, header), "Proving nullifier non-inclusion failed!");
}

pub fn prove_note_not_nullified<Note, N>(
    note: Note,
    context: &mut PrivateContext
) where Note: NoteInterface<N> {
    let nullifier = compute_siloed_nullifier(note, context);

    assert(nullifier_valid_non_inclusion(nullifier, context.historical_header), "Proving nullifier non-inclusion failed!");
}

pub fn prove_note_not_nullified_at<Note, N>(
    note: Note,
    block_number: u32, // The block at which we'll prove that the note was not nullified
    context: &mut PrivateContext
) where Note: NoteInterface<N> {
    let nullifier = compute_siloed_nullifier(note, context);
    let header = context.get_header_at(block_number);

    assert(nullifier_valid_non_inclusion(nullifier, header), "Proving nullifier non-inclusion failed!");
}
