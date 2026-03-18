//! Nullifier existence and non-existence.

use crate::oracle::get_nullifier_membership_witness::{
    get_low_nullifier_membership_witness, get_nullifier_membership_witness,
};

use crate::protocol::{
    abis::block_header::BlockHeader,
    merkle_tree::root::root_from_sibling_path,
    traits::Hash,
    utils::field::{full_field_greater_than, full_field_less_than},
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
/// This function performs a single merkle tree inclusion proof, which is in the order of 4k gates.
///
/// If you don't need to assert existence at a _specific_ past block, consider using
/// [`PrivateContext::assert_nullifier_exists`](crate::context::PrivateContext::assert_nullifier_exists) instead, which
/// is typically cheaper. Note that there are semantic differences though, as that function also considers _pending_
/// nullifiers.
pub fn assert_nullifier_existed_by(block_header: BlockHeader, siloed_nullifier: Field) {
    // 1) Get the membership witness of the nullifier.
    // Safety: The witness is only used as a "magical value" that makes the proof below pass. Hence it's safe.
    let witness = unsafe { get_nullifier_membership_witness(block_header, siloed_nullifier) };

    // 2) First we prove that the tree leaf in the witness is present in the nullifier tree. This is expected to be the
    // leaf that contains the nullifier we're proving inclusion for.
    assert_eq(
        block_header.state.partial.nullifier_tree.root,
        root_from_sibling_path(witness.leaf_preimage.hash(), witness.index, witness.path),
        "Proving nullifier inclusion failed",
    );

    // 3) Then we simply check that the value in the leaf is the expected one. Note that we don't need to perform any
    // checks on the rest of the values in the leaf preimage (the next index or next nullifier), since all we care
    // about is showing that the tree contains an entry with the expected nullifier.
    assert_eq(witness.leaf_preimage.nullifier, siloed_nullifier, "Nullifier does not match value in witness");
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
/// This function performs a single merkle tree inclusion proof, which is in the order of 4k gates.
pub fn assert_nullifier_did_not_exist_by(block_header: BlockHeader, siloed_nullifier: Field) {
    // 1) Get the membership witness of a low nullifier of the nullifier.
    // Safety: The witness is only used as a "magical value" that makes the proof below pass. Hence it's safe.
    let witness = unsafe { get_low_nullifier_membership_witness(block_header, siloed_nullifier) };

    // 2) Check that the leaf preimage is not empty. An empty leaf preimage would pass validation as a low leaf.
    // However, it's not a valid low leaf. It's used to pad the nullifiers emitted from a tx so they can be inserted
    // into the tree in a fixed-size batch.
    assert(!witness.leaf_preimage.is_empty(), "The provided nullifier tree leaf preimage cannot be empty");

    // 3) Prove that the tree leaf in the witness is present in the nullifier tree. This is expected to be the 'low
    // leaf', i.e. the leaf that would come immediately before the nullifier's leaf, if the nullifier were to be in the
    // tree.
    let low_nullifier_leaf = witness.leaf_preimage;
    assert_eq(
        block_header.state.partial.nullifier_tree.root,
        root_from_sibling_path(low_nullifier_leaf.hash(), witness.index, witness.path),
        "Proving nullifier non-inclusion failed: Could not prove low nullifier inclusion",
    );

    // 4) Prove that the low leaf is indeed smaller than the nullifier
    assert(
        full_field_less_than(low_nullifier_leaf.nullifier, siloed_nullifier),
        "Proving nullifier non-inclusion failed: low_nullifier.value < nullifier.value check failed",
    );

    // 5) Prove that the low leaf is pointing "over" the nullifier, which means that the nullifier is not included in
    // the nullifier tree, since if it were it'd need to be between the low leaf and the next leaf. Note the special
    // case in which the low leaf is the largest of all entries, in which case there's no 'next' entry.
    assert(
        full_field_greater_than(low_nullifier_leaf.next_nullifier, siloed_nullifier)
            | (low_nullifier_leaf.next_index == 0),
        "Proving nullifier non-inclusion failed: low_nullifier.next_value > nullifier.value check failed",
    );
}
