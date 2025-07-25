mod test;
// docs:start:setup
use dep::aztec::macros::aztec;

#[aztec]
pub contract Counter {
    // docs:end:setup
    // docs:start:imports
    use aztec::{
        macros::{functions::{initializer, private, public, utility}, storage::storage},
        oracle::debug_log::debug_log_format,
        protocol_types::{address::AztecAddress, traits::ToField},
        state_vars::Map,
    };
    use easy_private_state::EasyPrivateUint;
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
        counters.at(owner).add(headstart, owner);
    }
    // docs:end:constructor

    // docs:start:increment
    #[private]
    fn increment(owner: AztecAddress) {
        debug_log_format("Incrementing counter for owner {0}", [owner.to_field()]);

        Counter::at(context.this_address()).emit_in_public(12345).enqueue(&mut context);

        let counters = storage.counters;
        counters.at(owner).add(1, owner);
    }
    // docs:end:increment

    #[private]
    fn increment_twice(owner: AztecAddress) {
        debug_log_format(
            "Incrementing counter twice for owner {0}",
            [owner.to_field()],
        );
        let counters = storage.counters;
        counters.at(owner).add(1, owner);
        counters.at(owner).add(1, owner);
    }

    #[private]
    fn increment_and_decrement(owner: AztecAddress) {
        debug_log_format(
            "Incrementing and decrementing counter for owner {0}",
            [owner.to_field()],
        );
        let counters = storage.counters;
        counters.at(owner).add(1, owner);
        counters.at(owner).sub(1, owner);
    }

    #[private]
    fn decrement(owner: AztecAddress) {
        debug_log_format("Decrementing counter for owner {0}", [owner.to_field()]);
        let counters = storage.counters;
        counters.at(owner).sub(1, owner);
    }

    // docs:start:get_counter
    #[utility]
    unconstrained fn get_counter(owner: AztecAddress) -> Field {
        storage.counters.at(owner).get_value()
    }

    #[private]
    fn increment_self_and_other(other_counter: AztecAddress, owner: AztecAddress) {
        debug_log_format("Incrementing counter for other {0}", [owner.to_field()]);

        let counters = storage.counters;
        counters.at(owner).add(1, owner);

        Counter::at(context.this_address()).emit_in_public(9876).enqueue(&mut context);
        Counter::at(other_counter).increment(owner).call(&mut context);
    }

    #[public]
    fn emit_in_public(n: Field) {
        context.push_note_hash(n);
    }

    // docs:end:get_counter
    // docs:start:test_imports
    use crate::test;

    // docs:end:test_imports
    // docs:start:txe_test_increment
    #[test]
    unconstrained fn test_increment() {
        let initial_value = 5;
        let (mut env, contract_address, owner) = test::setup(initial_value);

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
        let _ = env.call_private(owner, Counter::at(contract_address).increment(owner));

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
        let (env, contract_address, owner) = test::setup(initial_value);

        // Checking that the note was discovered from private logs
        let initial_note_value =
            env.simulate_utility(Counter::at(contract_address)._experimental_get_counter(owner));
        assert(initial_note_value == initial_value);

        let _ = env.call_private(owner, Counter::at(contract_address).increment_twice(owner));

        assert_eq(
            env.simulate_utility(Counter::at(contract_address)._experimental_get_counter(owner)),
            7,
        );

        let _ =
            env.call_private(owner, Counter::at(contract_address).increment_and_decrement(owner));
        assert_eq(
            env.simulate_utility(Counter::at(contract_address)._experimental_get_counter(owner)),
            7,
        );

        let _ = env.call_private(owner, Counter::at(contract_address).decrement(owner));
        assert_eq(
            env.simulate_utility(Counter::at(contract_address)._experimental_get_counter(owner)),
            6,
        );
    }
}
