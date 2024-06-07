contract Counter {
    // docs:start:imports
    use dep::aztec::prelude::{AztecAddress, Map};
    use dep::value_note::{balance_utils, value_note::{ValueNote, VALUE_NOTE_LEN}};
    use dep::easy_private_state::EasyPrivateUint;
    // docs:end:imports

    // docs:start:storage_struct
    #[aztec(storage)]
    struct Storage {
        counters: Map<AztecAddress, EasyPrivateUint>,
    }
    // docs:end:storage_struct

    // docs:start:constructor
    #[aztec(private)]
    #[aztec(initializer)]
    // We can name our initializer anything we want as long as it's marked as aztec(initializer)
    fn initialize(headstart: u64, owner: AztecAddress, outgoing_viewer: AztecAddress) {
        let counters = storage.counters;
        counters.at(owner).add(headstart, owner, outgoing_viewer);
    }
    // docs:end:constructor

    // docs:start:increment
    #[aztec(private)]
    fn increment(owner: AztecAddress, outgoing_viewer: AztecAddress) {
        dep::aztec::oracle::debug_log::debug_log_format("Incrementing counter for owner {0}", [owner.to_field()]);
        let counters = storage.counters;
        counters.at(owner).add(1, owner, outgoing_viewer);
    }
    // docs:end:increment

    // docs:start:get_counter
    unconstrained fn get_counter(owner: AztecAddress) -> pub Field {
        let counters = storage.counters;
        balance_utils::get_balance(counters.at(owner).set)
    }
    // docs:end:get_counter

    use dep::aztec::test::{helpers::{cheatcodes, test_environment::TestEnvironment}};
    use dep::aztec::protocol_types::storage::map::derive_storage_slot_in_map;
    use dep::aztec::oracle::{storage::{storage_read, storage_write}};
    use dep::aztec::keys::PublicKeys;
    use dep::aztec::protocol_types::grumpkin_point::GrumpkinPoint;
    use dep::aztec::protocol_types::address::PartialAddress;

    #[test]
    fn test_initialize() {
        let mut env = TestEnvironment::new();
        let owner = env.get_address_with_keys(AztecAddress::from_field(13));
        let outgoing_viewer = env.get_address_with_keys(AztecAddress::from_field(14));
        cheatcodes::advance_blocks(30);
        let initializer = Counter::interface().initialize(5, owner, outgoing_viewer);
        let _contract_address = cheatcodes::deploy("@aztec/noir-contracts.js/Counter").with_private_initializer(initializer, 30);
        let counter_slot = Counter::storage().counters.slot;
        let owner_slot = derive_storage_slot_in_map(counter_slot, owner);
        let stored: [Field; 1] = storage_read(owner_slot);
        assert(stored[0] == 5);
    }
}
