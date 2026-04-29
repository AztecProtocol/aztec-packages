use types::{
    merkle_tree::{check_membership_with_hasher, LeafPreimage, MembershipWitness},
    side_effect::{Counted, Readable, Scoped},
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

pub struct SettledReadHint<let TreeHeight: u32, SettledReadLeafPreimage> {
    pub read_request_index: u32,
    pub membership_witness: MembershipWitness<TreeHeight>,
    pub leaf_preimage: SettledReadLeafPreimage,
}

impl<let TreeHeight: u32, SettledReadLeafPreimage> SettledReadHint<TreeHeight, SettledReadLeafPreimage>
where
    SettledReadLeafPreimage: Empty,
{
    pub fn skip(read_request_len: u32) -> Self {
        Self {
            read_request_index: read_request_len,
            membership_witness: MembershipWitness::empty(),
            leaf_preimage: SettledReadLeafPreimage::empty(),
        }
    }
}

/// Validates "settled" read requests (reads of values already committed in a tree) against the provided tree root.
///
/// Context:
/// - A settled read requires proving membership of a leaf in the tree corresponding to a past state.
/// - Each hint links a read request to a leaf preimage and provides its membership witness.
/// - Unused hints must be marked with `read_request_index == ReadRequestLen`.
///
/// Invariants checked:
/// 1. If a hint is active (its `read_request_index` is NOT `ReadRequestLen`):
///    - The leaf preimage must match the corresponding read request.
///    - The membership witness must prove that the leaf exists in the tree with the given root.
/// 2. If a hint is inactive (its `read_request_index` is ` ReadRequestLen`):
///    - It is ignored (no validation performed).
pub fn validate_settled_read_requests<let ReadRequestLen: u32, let SettledReadHintsLen: u32, let TreeHeight: u32, SettledReadLeafPreimage>(
    read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, ReadRequestLen>,
    settled_read_hints: [SettledReadHint<TreeHeight, SettledReadLeafPreimage>; SettledReadHintsLen],
    tree_root: Field,
    merkle_hasher: fn(Field, Field) -> Field,
)
where
    SettledReadLeafPreimage: LeafPreimage + Readable,
{
    for hint in settled_read_hints {
        let read_request_index = hint.read_request_index;
        if read_request_index != ReadRequestLen {
            let read_request = read_requests.array[read_request_index];
            // To read a settled value, the app should have siloed the value with the contract address so that it
            // matches the siloed value stored in the tree.
            // I.e. the `Field` within a _settled_ read_request is the final note_hash or nullifier
            // that was inserted into the tree.

            // While the contract address could technically be ignored here, we assert that it is zero to prevent
            // misconfigured hints from causing a pending read request to be incorrectly validated as a settled read
            // request.
            assert(
                read_request.contract_address.is_zero(),
                "Settled read request must have zero contract address",
            );

            let leaf_preimage = hint.leaf_preimage;

            // Validate that the leaf preimage value matches the read request.
            // For the relevant, concrete implementations of `assert_match_read_request`, search for:
            // - `impl Readable for NoteHashLeafPreimage` and
            // - `impl Readable for NullifierLeafPreimage`
            leaf_preimage.assert_match_read_request(read_request.innermost());

            // Validate that the leaf preimage exists in the tree.
            // For the relevant, concrete implementations of `as_leaf`, search for:
            // - `impl LeafPreimage for NoteHashLeafPreimage` and
            // - `impl LeafPreimage for NullifierLeafPreimage`
            let leaf = leaf_preimage.as_leaf();
            let witness = hint.membership_witness;
            assert(
                check_membership_with_hasher(leaf, witness, tree_root, merkle_hasher),
                "Membership check failed: leaf for read request not found in tree",
            );
        }
    }
}
