//! Nullifier creation, existence checks, etc.

use crate::ephemeral::EphemeralArray;
use crate::oracle::block_reference::BlockReference;
use crate::protocol::{address::aztec_address::AztecAddress, traits::Deserialize};

/// Notifies the simulator that a nullifier has been created, so that its correct status (pending or settled) can be
/// determined when reading nullifiers in subsequent private function calls. The first non-revertible nullifier emitted
/// is also used to compute note nonces.
pub fn notify_created_nullifier(inner_nullifier: Field) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call.
    unsafe { notify_created_nullifier_oracle(inner_nullifier) };
}

#[oracle(aztec_prv_notifyCreatedNullifier)]
unconstrained fn notify_created_nullifier_oracle(_inner_nullifier: Field) {}

/// Returns `true` if the nullifier has been emitted in the same transaction, i.e. if [`notify_created_nullifier`] has
/// been
/// called for this inner nullifier from the contract with the specified address.
///
/// Note that despite sharing pending transaction information with the app, this is not a privacy leak: anyone in the
/// network can always determine in which transaction a inner nullifier was emitted by a given contract by simply
/// inspecting transaction effects. What _would_ constitute a leak would be to share the list of inner pending
/// nullifiers, as that would reveal their preimages.
pub unconstrained fn is_nullifier_pending(inner_nullifier: Field, contract_address: AztecAddress) -> bool {
    is_nullifier_pending_oracle(inner_nullifier, contract_address)
}

#[oracle(aztec_prv_isNullifierPending)]
unconstrained fn is_nullifier_pending_oracle(_inner_nullifier: Field, _contract_address: AztecAddress) -> bool {}

/// The existence status of a nullifier.
#[derive(Deserialize, Eq)]
pub struct NullifierStatus {
    pub exists: bool,

    /// The block the nullifier was included in.
    ///
    /// `None` if the nullifier does not exist, or if it is pending (emitted earlier in the current transaction and not
    /// yet in any block).
    pub origin_block: Option<BlockReference>,
}

/// Returns the existence status of multiple nullifiers.
///
/// Same guarantees as [`check_nullifier_exists`]: an existing nullifier can be constrained by proving its inclusion,
/// but a non-existent one cannot be relied upon. Proving the `origin_block` however is fairly involved, as it'd require
/// proving existence of the transaction in which the nullifier was emitted, inclusion of the transaction in the block,
/// and ancestry of the block in the anchor block.
pub unconstrained fn get_nullifier_statuses(
    inner_nullifiers: EphemeralArray<Field>,
) -> EphemeralArray<NullifierStatus> {
    get_nullifier_statuses_oracle(inner_nullifiers)
}

/// Returns `true` if the nullifier exists.
///
/// Note that a `true` value can be constrained by proving existence of the nullifier, but a `false` value should not be
/// relied upon since other transactions may emit this nullifier before the current transaction is included in a block.
/// While this might seem of little use at first, certain design patterns benefit from this abstraction (see e.g.
/// `PrivateMutable`).
// TODO(F-498): review naming consistency
pub unconstrained fn check_nullifier_exists(inner_nullifier: Field) -> bool {
    get_nullifier_statuses(EphemeralArray::from_array([inner_nullifier])).get(0).exists
}

#[oracle(aztec_utl_getNullifierStatuses)]
unconstrained fn get_nullifier_statuses_oracle(
    _inner_nullifiers: EphemeralArray<Field>,
) -> EphemeralArray<NullifierStatus> {}
