// Demonstrates nested utility calls by implementing pow_utility(x, n) = x^n recursively,
// and calling it from a private function via pow_private.
//
// A custom sync_state hook additionally makes a cross-contract utility call to the instance stored in the
// sync-target capsule (when one is set), so tests can cover authorization of utility calls made during
// contract sync.

use aztec::{
    macros::{aztec, AztecConfig},
    messages::{
        discovery::{ComputeNoteHash, ComputeNoteNullifier, CustomMessageHandler, do_sync_state},
        processing::offchain::OffchainInboxSync,
    },
    oracle::{call_utility_function::call_utility_function, capsules},
    protocol::{address::AztecAddress, hash::sha256_to_field},
};

mod pow_note;
mod test;

global SYNC_UTILITY_TARGET_SLOT: Field = sha256_to_field("SYNC_UTILITY_TARGET".as_bytes());
global SYNC_CALL_RESULT_SLOT: Field = sha256_to_field("SYNC_CALL_RESULT".as_bytes());

#[aztec(AztecConfig::new().custom_sync_state(sync_with_cross_contract_utility_call))]
pub contract NestedUtility {
    use crate::pow_note::PowNote;
    use aztec::macros::{functions::{external, view}, storage::storage};
    use aztec::{
        messages::delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::{Owned, PrivateMutable},
    };

    #[storage]
    struct Storage<Context> {
        pow_args: Owned<PrivateMutable<PowNote, Context>, Context>,
    }

    #[external("utility")]
    unconstrained fn pow_utility(x: Field, n: u32) -> Field {
        if n == 0 {
            1
        } else {
            x * self.call_self.pow_utility(x, n - 1)
        }
    }

    #[external("utility")]
    unconstrained fn delegate_pow_utility(target: AztecAddress, x: Field, n: u32) -> Field {
        self.call(NestedUtility::at(target).pow_utility(x, n))
    }

    /// Stores the base and exponent for pow in a private note.
    #[external("private")]
    fn set_pow_args(x: Field, n: Field) {
        let owner = self.msg_sender();
        self.storage.pow_args.at(owner).initialize_or_replace(|_| PowNote { x, n }).deliver(
            MessageDelivery::onchain_unconstrained(),
        );
    }

    /// Reads x and n from storage and computes x^n.
    #[external("utility")]
    unconstrained fn pow_from_storage(owner: AztecAddress) -> Field {
        let note = self.storage.pow_args.at(owner).view_note();
        self.call_self.pow_utility(note.x, note.n as u32)
    }

    /// Cross-contract version: calls pow_from_storage on the target contract.
    #[external("utility")]
    unconstrained fn delegate_pow_from_storage(target: AztecAddress, owner: AztecAddress) -> Field {
        self.call(NestedUtility::at(target).pow_from_storage(owner))
    }

    /// Returns this utility's `msg_sender`
    #[external("utility")]
    unconstrained fn get_msg_sender() -> Option<AztecAddress> {
        self.context.maybe_msg_sender()
    }

    /// Cross-contract version: calls get_msg_sender on the target, whose msg_sender is therefore this contract.
    #[external("utility")]
    unconstrained fn delegate_get_msg_sender(target: AztecAddress) -> Option<AztecAddress> {
        self.call(NestedUtility::at(target).get_msg_sender())
    }

    #[external("private")]
    fn pow_private(x: Field, n: u32) -> Field {
        // Safety: this is a test contract; the unconstrained result is returned directly
        // and never used as input to a constrained assertion
        unsafe {
            self.utility.call_self.pow_utility(x, n)
        }
    }

    #[external("private")]
    fn delegate_pow_private(target: AztecAddress, x: Field, n: u32) -> Field {
        // Safety: this is a test contract; the unconstrained result is returned directly
        // and never used as input to a constrained assertion
        unsafe {
            self.utility.call(NestedUtility::at(target).pow_utility(x, n))
        }
    }

    #[view]
    #[external("private")]
    fn delegate_pow_view(target: AztecAddress, x: Field, n: u32) -> Field {
        // Safety: this is a test contract; the unconstrained result is returned directly
        // and never used as input to a constrained assertion
        unsafe {
            self.utility.call(NestedUtility::at(target).pow_utility(x, n))
        }
    }
}

/// Calls `pow_utility` on the instance stored in the sync-target capsule (when one is set), recording the result in
/// the sync-call-result capsule, then forwards to [`do_sync_state`] so that normal note discovery still happens.
unconstrained fn sync_with_cross_contract_utility_call(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler>,
    offchain_inbox_sync: Option<OffchainInboxSync>,
    scope: AztecAddress,
) {
    let maybe_target: Option<AztecAddress> = capsules::load(contract_address, SYNC_UTILITY_TARGET_SLOT, scope);
    if maybe_target.is_some() {
        let call = NestedUtility::at(maybe_target.unwrap()).pow_utility(2, 3);
        let return_values: [Field; 1] = call_utility_function(call.target_contract, call.selector, call.args);
        capsules::store(
            contract_address,
            SYNC_CALL_RESULT_SLOT,
            return_values[0],
            scope,
        );
    }
    do_sync_state(
        contract_address,
        compute_note_hash,
        compute_note_nullifier,
        process_custom_message,
        offchain_inbox_sync,
        scope,
    );
}
