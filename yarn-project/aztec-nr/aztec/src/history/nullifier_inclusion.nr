use dep::std::merkle::compute_merkle_root;

use crate::{
    context::PrivateContext,
    oracle::get_nullifier_membership_witness::get_nullifier_membership_witness,
};

pub fn prove_nullifier_inclusion(nullifier: Field, context: PrivateContext) {
    // 1) Get the membership witness of the nullifier
    let witness = get_nullifier_membership_witness(
        context.historical_header.global_variables.block_number as u32,
        nullifier
    );

    // 2) Check that the witness we obtained matches the nullifier
    assert(witness.leaf_preimage.nullifier == nullifier, "Nullifier does not match value in witness");

    // 3) Compute the nullifier tree leaf
    let nullifier_leaf = witness.leaf_preimage.hash();

    // 4) Prove that the nullifier is in the nullifier tree
    assert(
        context.historical_header.state.partial.nullifier_tree.root
        == compute_merkle_root(nullifier_leaf, witness.index, witness.path), "Proving nullifier inclusion failed"
    );
    // --> Now we have traversed the trees all the way up to archive root and verified that the nullifier
    //     was not yet included in the nullifier tree.
}
