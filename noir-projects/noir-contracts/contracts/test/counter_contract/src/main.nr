mod test;
// docs:start:setup
use dep::aztec::macros::aztec;

#[aztec]
pub contract Counter {
    // docs:end:setup
    // docs:start:imports
    use aztec::macros::{functions::{initializer, private, public, utility}, storage::storage};
    use aztec::prelude::{AztecAddress, Map};
    use aztec::protocol_types::{
        abis::function_selector::FunctionSelector,
        traits::{FromField, ToField},
    };
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

        Counter::at(context.this_address()).emit_in_public(12345).enqueue(&mut context);

        let counters = storage.counters;
        counters.at(owner).add(1, owner, sender);
    }
    // docs:end:increment

    #[private]
    fn increment_twice(owner: AztecAddress, sender: AztecAddress) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Incrementing counter twice for owner {0}",
                [owner.to_field()],
            );
        }
        let counters = storage.counters;
        counters.at(owner).add(1, owner, sender);
        counters.at(owner).add(1, owner, sender);
    }

    #[private]
    fn increment_and_decrement(owner: AztecAddress, sender: AztecAddress) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Incrementing and decrementing counter for owner {0}",
                [owner.to_field()],
            );
        }
        let counters = storage.counters;
        counters.at(owner).add(1, owner, sender);
        counters.at(owner).sub(1, owner, sender);
    }

    #[private]
    fn decrement(owner: AztecAddress, sender: AztecAddress) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Decrementing counter for owner {0}",
                [owner.to_field()],
            );
        }
        let counters = storage.counters;
        counters.at(owner).sub(1, owner, sender);
    }

    // docs:start:get_counter
    #[utility]
    unconstrained fn get_counter(owner: AztecAddress) -> Field {
        let counters = storage.counters;
        balance_utils::get_balance(counters.at(owner).set)
    }

    #[private]
    fn increment_self_and_other(
        other_counter: AztecAddress,
        owner: AztecAddress,
        sender: AztecAddress,
    ) {
        unsafe {
            dep::aztec::oracle::debug_log::debug_log_format(
                "Incrementing counter for other {0}",
                [owner.to_field()],
            );
        }

        let counters = storage.counters;
        counters.at(owner).add(1, owner, sender);

        Counter::at(context.this_address()).emit_in_public(9876).enqueue(&mut context);
        Counter::at(other_counter).increment(owner, sender).call(&mut context);
    }

    #[public]
    fn emit_in_public(n: Field) {
        context.push_note_hash(n);
    }

    // docs:end:get_counter
    // docs:start:test_imports
    use crate::test;
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
        let owner = env.create_account(1);
        let sender = env.create_account(2);
        let initial_value: Field = 5;

        // Deploy contract and initialize
        let initializer = Counter::interface().initialize(initial_value as u64, owner);
        let contract_address =
            env.deploy_self("Counter").with_private_initializer(owner, initializer).to_address();

        // docs:start:txe_test_read_notes
        // Read the stored value in the note
        let initial_counter =
            env.simulate_utility(Counter::at(contract_address)._experimental_get_counter(owner));
        assert(
            initial_counter == initial_value,
            f"Expected {initial_value} but got {initial_counter}",
        );
        // docs:end:txe_test_read_notes

        // Increment the counter
        let _ =
            env.call_private_void(owner, Counter::at(contract_address).increment(owner, sender));

        let incremented_counter =
            env.simulate_utility(Counter::at(contract_address)._experimental_get_counter(owner));
        let expected_current_value = initial_value + 1;
        assert(
            expected_current_value == incremented_counter,
            f"Expected {expected_current_value} but got {incremented_counter}",
        );
    }
    // docs:end:txe_test_increment

    #[test]
    unconstrained fn extended_incrementing_and_decrementing() {
        let initial_value = 5;
        let (env, contract_address, owner, sender) = test::setup(initial_value);

        // Checking that the note was discovered from private logs
        env.impersonate(contract_address);
        sync_private_state();
        let counter_slot = Counter::storage_layout().counters.slot;
        let owner_storage_slot = derive_storage_slot_in_map(counter_slot, owner);
        let mut options = NoteViewerOptions::new();
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> =
            view_notes(owner_storage_slot, options);
        let initial_note_value = notes.get(0).value;
        assert(
            initial_note_value == initial_value,
            f"Expected {initial_value} but got {initial_note_value}",
        );

        Counter::at(contract_address).increment_twice(owner, sender).call(&mut env.private());

        // Checking from the note cache
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> =
            view_notes(owner_storage_slot, options);
        assert(notes.len() == 3);
        assert(get_counter(owner) == 7);

        // Checking that the note was discovered from private logs
        env.advance_block_by(1);
        sync_private_state();
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> =
            view_notes(owner_storage_slot, options);
        assert(get_counter(owner) == 7);
        assert(notes.len() == 3);

        // Checking from the note cache
        Counter::at(contract_address).increment_and_decrement(owner, sender).call(&mut env.private());
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> =
            view_notes(owner_storage_slot, options);
        assert(get_counter(owner) == 7);
        // We have a change note of 0
        assert(notes.len() == 4);

        // Checking that the note was discovered from private logs
        env.advance_block_by(1);
        sync_private_state();
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> =
            view_notes(owner_storage_slot, options);
        assert(notes.len() == 4);
        assert(get_counter(owner) == 7);

        // Checking from the note cache
        Counter::at(contract_address).decrement(owner, sender).call(&mut env.private());
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> =
            view_notes(owner_storage_slot, options);
        assert(get_counter(owner) == 6);
        assert(notes.len() == 4);

        // Checking that the note was discovered from private logs
        env.advance_block_by(1);
        sync_private_state();
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> =
            view_notes(owner_storage_slot, options);
        assert(get_counter(owner) == 6);
        assert(notes.len() == 4);
    }
}
