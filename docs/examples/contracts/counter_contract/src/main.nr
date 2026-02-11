// docs:start:setup
use aztec::macros::aztec;

#[aztec]
pub contract Counter {
    // docs:end:setup
    // docs:start:imports
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::message_delivery::MessageDelivery,
        oracle::logging::debug_log_format,
        protocol::{address::AztecAddress, traits::ToField},
        state_vars::Owned,
    };
    use balance_set::BalanceSet;
    // docs:end:imports

    // docs:start:storage_struct
    #[storage]
    struct Storage<Context> {
        counters: Owned<BalanceSet<Context>, Context>,
    }
    // docs:end:storage_struct

    // docs:start:constructor
    #[initializer]
    #[external("private")]
    // We can name our initializer anything we want as long as it's marked as aztec(initializer)
    fn initialize(headstart: u64, owner: AztecAddress) {
        self.storage.counters.at(owner).add(headstart as u128).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }
    // docs:end:constructor

    // docs:start:increment
    #[external("private")]
    fn increment(owner: AztecAddress) {
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
