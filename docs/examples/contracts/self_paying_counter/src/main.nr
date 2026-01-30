// docs:start:all
use dep::aztec::macros::aztec;

#[aztec]
pub contract SelfPayingCounter {
    // docs:start:imports
    use aztec::{
        macros::{functions::{external, initializer, nophasecheck}, storage::storage},
        messages::message_delivery::MessageDelivery,
        oracle::debug_log::debug_log_format,
        protocol_types::{address::AztecAddress, traits::ToField},
        state_vars::Owned,
    };
    use balance_set::BalanceSet;
    // docs:end:imports

    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        counters: Owned<BalanceSet<Context>, Context>,
    }
    // docs:end:storage

    // docs:start:constructor
    #[initializer]
    #[external("private")]
    fn initialize(headstart: u64, owner: AztecAddress) {
        self.storage.counters.at(owner).add(headstart as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }
    // docs:end:constructor

    // docs:start:increment
    /// The key function: increment pays its own fees.
    /// This function acts as both the fee payer AND performs app logic.
    ///
    /// Flow:
    /// 1. Setup phase: set_as_fee_payer() + end_setup()
    /// 2. Execution phase: app logic runs (counter increment)
    #[external("private")]
    #[nophasecheck]
    fn increment(owner: AztecAddress) {
        // === SETUP PHASE (non-revertible) ===
        // The contract pays for the transaction fee
        self.context.set_as_fee_payer();
        // End setup transitions to the revertible execution phase
        // Without this, the entire transaction stays in non-revertible setup phase
        self.context.end_setup();

        // === EXECUTION PHASE (revertible) ===
        // Now we can perform our app logic
        debug_log_format("Incrementing counter for owner {0}", [owner.to_field()]);
        self.storage.counters.at(owner).add(1).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
    }
    // docs:end:increment

    // docs:start:get_counter
    #[external("utility")]
    unconstrained fn get_counter(owner: AztecAddress) -> pub u128 {
        self.storage.counters.at(owner).balance_of()
    }
    // docs:end:get_counter
}
// docs:end:all
