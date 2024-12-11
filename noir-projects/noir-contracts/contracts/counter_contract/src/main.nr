// docs:start:setup
use dep::aztec::macros::aztec;

#[aztec]
contract Counter {
    // docs:end:setup
    // docs:start:imports
    use aztec::macros::{functions::{initializer, private}, storage::storage};
    use aztec::prelude::{AztecAddress, Map};
    use easy_private_state::EasyPrivateUint;
    use value_note::{balance_utils, value_note::ValueNote};
    // docs:end:imports

    // docs:start:storage_struct
    #[storage]
    struct Storage<Context> {
        counters: Map<AztecAddress, EasyPrivateUint<Context>, Context>,
    }
    // docs:end:storage_struct

    // docs:start:constructor
    #[initializer]
    #[private]
    // We can name our initializer anything we want as long as it's marked as aztec(initializer)
    fn initialize(headstart: u64, owner: AztecAddress) {
        let counters = storage.counters;
        counters.at(owner).add(headstart, owner, context.msg_sender());
    }
    // docs:end:constructor

    // docs:start:increment
    #[private]
    fn increment(owner: AztecAddress, sender: AztecAddress) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Incrementing counter for owner {0}",
                [owner.to_field()],
            );
        }
        let counters = storage.counters;
        counters.at(owner).add(1, owner, sender);
    }
    // docs:end:increment
    // docs:start:get_counter
    unconstrained fn get_counter(owner: AztecAddress) -> pub Field {
        let counters = storage.counters;
        balance_utils::get_balance(counters.at(owner).set)
    }

    // docs:end:get_counter
    // docs:start:test_imports
    use dep::aztec::note::note_getter::{MAX_NOTES_PER_PAGE, view_notes};
    use dep::aztec::note::note_viewer_options::NoteViewerOptions;
    use dep::aztec::protocol_types::storage::map::derive_storage_slot_in_map;
    use dep::aztec::test::helpers::test_environment::TestEnvironment;
    // docs:end:test_imports
    // docs:start:txe_test_increment
    #[test]
    unconstrained fn test_increment() {
        // Setup env, generate keys
        let mut env = TestEnvironment::new();
        let owner = env.create_account();
        let sender = env.create_account();
        let initial_value: Field = 5;
        env.impersonate(owner);
        // Deploy contract and initialize
        let initializer = Counter::interface().initialize(initial_value as u64, owner);
        let counter_contract = env.deploy_self("Counter").with_private_initializer(initializer);
        let contract_address = counter_contract.to_address();
        // docs:start:txe_test_read_notes
        // Read the stored value in the note
        env.impersonate(contract_address);
        let counter_slot = Counter::storage_layout().counters.slot;
        let owner_slot = derive_storage_slot_in_map(counter_slot, owner);
        let mut options = NoteViewerOptions::new();
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_slot, options);
        let initial_note_value = notes.get(0).value;
        assert(
            initial_note_value == initial_value,
            f"Expected {initial_value} but got {initial_note_value}",
        );
        // docs:end:txe_test_read_notes
        // Increment the counter
        Counter::at(contract_address).increment(owner, sender).call(&mut env.private());
        // get_counter is an unconstrained function, so we call it directly (we're in the same module)
        let current_value_for_owner = get_counter(owner);
        let expected_current_value = initial_value + 1;
        assert(
            expected_current_value == current_value_for_owner,
            f"Expected {expected_current_value} but got {current_value_for_owner}",
        );
    }
    // docs:end:txe_test_increment
}
