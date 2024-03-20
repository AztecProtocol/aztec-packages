use dep::std::merkle::compute_merkle_root;
use dep::protocol_types::header::Header;

use crate::{
    context::{PrivateContext, ContextInterface},
    oracle::get_nullifier_membership_witness::{get_nullifier_membership_witness, NullifierMembershipWitness},
    note::{utils::compute_siloed_nullifier, note_interface::NoteInterface}
};

/**
 * This function checks if a nullifier is included in the nullifier tree at a given header.
 * IMPORTANT: If the function returns false, you don't have a proof of non-inclusion.
 *
 * @param nullifier The nullifier to prove inclusion of
 * @param header The header at which we'll prove that the nullifier exists in the nullifier tree
 * @return true if the nullifier is included in the nullifier tree, false otherwise
 */
pub fn nullifier_valid_inclusion(nullifier: Field, header: Header) -> bool {
    // 1) Get the membership witness of the nullifier
    get_nullifier_membership_witness(header.global_variables.block_number as u32, nullifier)
    // 2) Check that the witness we obtained matches the nullifier
    .filter(|witness: NullifierMembershipWitness| witness.leaf_preimage.nullifier == nullifier)
    // 3) Compute the nullifier tree leaf
    // 4) Prove that the nullifier is in the nullifier tree
    .filter(|witness: NullifierMembershipWitness| {
        let nullifier_leaf = witness.leaf_preimage.hash();
        header.state.partial.nullifier_tree.root
        == compute_merkle_root(nullifier_leaf, witness.index, witness.path)
    })
    // --> Now we have traversed the trees all the way up to archive root and verified that the nullifier
    // was included in the nullifier tree.
    .is_some()
}
