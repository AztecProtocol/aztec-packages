// docs:start:setup
use dep::aztec::macros::aztec;

#[aztec]
pub contract Counter {
    // docs:end:setup
    // docs:start:imports
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        oracle::debug_log::debug_log_format, protocol_types::{address::AztecAddress, traits::ToField},
    };
    use easy_private_state::EasyPrivateUint;
    // docs:end:imports

    // docs:start:storage_struct
    #[storage]
    struct Storage<Context> {
        counters: EasyPrivateUint<Context>,
    }
    // docs:end:storage_struct

    // docs:start:constructor
    #[initializer]
    #[external("private")]
    // We can name our initializer anything we want as long as it's marked as aztec(initializer)
    fn initialize(headstart: u64, owner: AztecAddress) {
        let counters = self.storage.counters;
        counters.add(headstart, owner);
    }
    // docs:end:constructor

    // docs:start:increment
    #[external("private")]
    fn increment(owner: AztecAddress) {
        debug_log_format("Incrementing counter for owner {0}", [owner.to_field()]);
        let counters = self.storage.counters;
        counters.add(1, owner);
    }
    // docs:end:increment

    // docs:start:get_counter
    #[external("utility")]
    unconstrained fn get_counter(owner: AztecAddress) -> Field {
        self.storage.counters.get_value(owner)
    }
    // docs:end:get_counter
}
