use crate::protocol::{address::AztecAddress, constants::L1_TO_L2_MSG_TREE_HEIGHT};

/// An unsiloed L1 to L2 message nullifier.
pub struct UnsiloedNullifier {
    pub contract_address: AztecAddress,
    pub nullifier: Field,
}

/// Returns the leaf index and sibling path of an entry in the L1 to L2 messaging tree, which can then be used to prove
/// its existence.
///
/// When `nullifier` is `Some`, the returned witness is guaranteed to be for a message that has not yet been consumed:
/// PXE checks it is not present in the nullifier tree. Pass `None` to retrieve the witness regardless of whether the
/// message has been consumed.
pub unconstrained fn get_l1_to_l2_membership_witness(
    message_hash: Field,
    nullifier: Option<UnsiloedNullifier>,
) -> (Field, [Field; L1_TO_L2_MSG_TREE_HEIGHT]) {
    get_l1_to_l2_membership_witness_oracle(message_hash, nullifier)
}

// Obtains membership witness (index and sibling path) for a message in the L1 to L2 message tree.
#[oracle(aztec_utl_getL1ToL2MembershipWitnessV2)]
unconstrained fn get_l1_to_l2_membership_witness_oracle(
    _message_hash: Field,
    _nullifier: Option<UnsiloedNullifier>,
) -> (Field, [Field; L1_TO_L2_MSG_TREE_HEIGHT]) {}
