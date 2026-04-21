//! Nullifier existence and non-existence.

use crate::oracle::get_nullifier_membership_witness::{
    get_low_nullifier_membership_witness, get_nullifier_membership_witness,
};

use crate::protocol::{
    abis::block_header::BlockHeader,
    merkle_tree::membership::{check_membership, check_non_membership},
    traits::Hash,
};

mod test;

/// Asserts that a nullifier existed by the time a block was mined.
///
/// This function takes a _siloed_ nullifier, i.e. the value that is actually stored in the tree. Use
/// [`crate::protocol::hash::compute_siloed_nullifier`] to convert an inner nullifier (what
/// [`PrivateContext::push_nullifier`](crate::context::PrivateContext::push_nullifier) takes) into a siloed one.
///
/// Note that this does not mean that the nullifier was created **at** `block_header`, only that it was present in the
/// tree once all transactions from `block_header` were executed.
///
/// In order to prove that a nullifier did **not** exist by `block_header`, use [`assert_nullifier_did_not_exist_by`].
///
/// ## Cost
///
/// This function performs a single merkle tree inclusion proof, which is ~4k gates.
///
/// If you don't need to assert existence at a _specific_ past block, consider using
/// [`PrivateContext::assert_nullifier_exists`](crate::context::PrivateContext::assert_nullifier_exists) instead, which
/// is typically cheaper. Note that there are semantic differences though, as that function also considers _pending_
/// nullifiers.
pub fn assert_nullifier_existed_by(block_header: BlockHeader, siloed_nullifier: Field) {
    // 1) Get the leaf preimage and membership witness of the nullifier.
    // Safety: These are only used as "magical values" that make the proof below pass. Hence it's safe.
    let (leaf_preimage, witness) = unsafe { get_nullifier_membership_witness(block_header, siloed_nullifier) };

    // 2) Prove that the leaf is present in the nullifier tree.
    assert(
        check_membership(
            leaf_preimage.hash(),
            witness,
            block_header.state.partial.nullifier_tree.root,
        ),
        "Proving nullifier inclusion failed",
    );

    // 3) Check that the value in the leaf is the expected one. We don't need to check the rest of the leaf preimage
    // (next index or next nullifier), since all we care about is that the tree contains an entry with the expected
    // nullifier.
    assert_eq(leaf_preimage.nullifier, siloed_nullifier, "Nullifier does not match value in witness");
}

/// Asserts that a nullifier did not exist by the time a block was mined.
///
/// This function takes a _siloed_ nullifier, i.e. the value that is actually stored in the tree. Use
/// [`crate::protocol::hash::compute_siloed_nullifier`] to convert an inner nullifier (what
/// [`PrivateContext::push_nullifier`](crate::context::PrivateContext::push_nullifier) takes) into a siloed one.
///
/// In order to prove that a nullifier **did** exist by `block_header`, use [`assert_nullifier_existed_by`].
///
/// ## Nullifier Non-Existence
///
/// Proving nullifier non-existence is always nuanced, as it is not possible to privately prove that a nullifier does
/// not exist by the time a transaction is executed. What this function does instead is assert that once all
/// transactions from `block_header` were executed, the nullifier was not in the tree.
///
/// If you **must** prove that a nullifier does not exist by the time a transaction is executed, there only two ways to
/// do this: by actually emitting the nullifier via
/// [`PrivateContext::push_nullifier`](crate::context::PrivateContext::push_nullifier) (which can of course can be done
/// once), or by calling a public contract function that calls
/// [`PublicContext::nullifier_exists_unsafe`](crate::context::PublicContext::nullifier_exists_unsafe) (which leaks
/// that this nullifier is being checked):
///
/// ```noir
/// #[external("public")]
/// #[only_self]
/// fn _assert_nullifier_does_not_exist(unsileod_nullifier: Field, contract_address: AztecAddress) {
///     assert(!self.context.nullifier_exists_unsafe(unsiloed_nullifier, contract_address));
/// }
/// ```
///
/// ## Cost
///
/// This function performs a single merkle tree inclusion proof, which is ~4k gates.
pub fn assert_nullifier_did_not_exist_by(block_header: BlockHeader, siloed_nullifier: Field) {
    // 1) Get the leaf preimage and membership witness of the low nullifier.
    // Safety: These are only used as "magical values" that make the proof below pass. Hence it's safe.
    let (low_leaf_preimage, witness) = unsafe { get_low_nullifier_membership_witness(block_header, siloed_nullifier) };

    // 2) Check that the leaf preimage is not empty. An empty leaf preimage would pass validation as a low leaf.
    // However, it's not a valid low leaf. It's used to pad the nullifiers emitted from a tx so they can be inserted
    // into the tree in a fixed-size batch.
    assert(!low_leaf_preimage.is_empty(), "The provided nullifier tree leaf preimage cannot be empty");

    // 3) Prove non-inclusion: the low leaf must exist in the tree and the nullifier must be in range of the low leaf
    // (i.e. greater than the low leaf's nullifier and less than the low leaf's next nullifier, or the low leaf points
    // to infinity meaning it is the largest entry). This guarantees the nullifier is not in the tree because, if it
    // were, it would need to be between the low leaf and the next leaf.
    let (non_inclusion, is_valid_low_leaf, low_leaf_exists) = check_non_membership(
        siloed_nullifier,
        low_leaf_preimage,
        witness,
        block_header.state.partial.nullifier_tree.root,
    );
    assert(low_leaf_exists, "Proving nullifier non-inclusion failed: Could not prove low nullifier inclusion");
    assert(is_valid_low_leaf, "Proving nullifier non-inclusion failed: invalid low leaf for the given nullifier");
    assert(non_inclusion, "Proving nullifier non-inclusion failed");
}
