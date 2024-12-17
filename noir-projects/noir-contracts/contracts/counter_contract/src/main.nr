// docs:start:setup
use dep::aztec::macros::aztec;
mod test;

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
    unconstrained fn get_counter(owner: AztecAddress) -> pub Field {
        let counters = storage.counters;
        balance_utils::get_balance(counters.at(owner).set)
    }

    // docs:end:get_counter
    // docs:start:test_imports
    use dep::aztec::note::lifecycle::destroy_note;
    use dep::aztec::note::note_getter::{MAX_NOTES_PER_PAGE, view_notes};
    use dep::aztec::note::note_viewer_options::NoteViewerOptions;

    use crate::test;
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

    #[test]
    unconstrained fn inclusion_proofs() {
        let initial_value = 5;
        let (env, contract_address, owner) = test::setup(initial_value);
        env.advance_block_by(1);

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

        let old_note = notes.get(0);

        env.private().get_block_header().prove_note_validity(old_note, &mut env.private());

        destroy_note(&mut env.private(), old_note);
        env.advance_block_by(1);

        env.private().get_block_header().prove_note_is_nullified(old_note, &mut env.private());
        env.private().get_block_header().prove_note_inclusion(old_note);

        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_slot, options);

        assert(notes.len() == 0);
    }

    #[test]
    unconstrained fn extended_incrementing_and_decrementing() {
        let initial_value = 5;
        let (env, contract_address, owner, sender) = test::setup(initial_value);

        // Checking from the note cache
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

        // Checking that the note was discovered from private logs
        env.advance_block_by(1);
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

        Counter::at(contract_address).increment_twice(owner, sender).call(&mut env.private());

        // Checking from the note cache
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_slot, options);
        assert(notes.len() == 3);
        assert(get_counter(owner) == 7);

        // Checking that the note was discovered from private logs
        env.advance_block_by(1);
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_slot, options);
        assert(get_counter(owner) == 7);
        assert(notes.len() == 3);

        // Checking from the note cache
        Counter::at(contract_address).increment_and_decrement(owner, sender).call(&mut env.private());
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_slot, options);
        assert(get_counter(owner) == 7);
        // We have a change note of 0
        assert(notes.len() == 4);

        // Checking that the note was discovered from private logs
        env.advance_block_by(1);
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_slot, options);
        assert(notes.len() == 4);
        assert(get_counter(owner) == 7);

        // Checking from the note cache
        Counter::at(contract_address).decrement(owner, sender).call(&mut env.private());
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_slot, options);
        assert(get_counter(owner) == 6);
        assert(notes.len() == 4);

        // Checking that the note was discovered from private logs
        env.advance_block_by(1);
        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_slot, options);
        assert(get_counter(owner) == 6);
        assert(notes.len() == 4);
    }

    #[test(should_fail)]
    unconstrained fn inclusion_proofs_failure() {
        let initial_value = 5;
        let (env, contract_address, owner) = test::setup(initial_value);

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

        let old_note = notes.get(0);

        env.private().get_block_header().prove_note_validity(old_note, &mut env.private());
    }
}
