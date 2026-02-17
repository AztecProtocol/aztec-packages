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

    #[external("private")]
    fn increment_twice(owner: AztecAddress) {
        debug_log_format(
            "Incrementing counter twice for owner {0}",
            [owner.to_field()],
        );
        self.storage.counters.at(owner).add(1).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
        self.storage.counters.at(owner).add(1).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
    }

    #[external("private")]
    fn increment_and_decrement(owner: AztecAddress) {
        debug_log_format(
            "Incrementing and decrementing counter for owner {0}",
            [owner.to_field()],
        );
        self.storage.counters.at(owner).add(1).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
        self.storage.counters.at(owner).sub(1).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
    }

    #[external("private")]
    fn decrement(owner: AztecAddress) {
        debug_log_format("Decrementing counter for owner {0}", [owner.to_field()]);
        self.storage.counters.at(owner).sub(1).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
    }

    // docs:start:get_counter
    #[external("utility")]
    unconstrained fn get_counter(owner: AztecAddress) -> u128 {
        self.storage.counters.at(owner).balance_of()
    }
    // docs:end:get_counter

    #[external("private")]
    fn increment_self_and_other(other_counter: AztecAddress, owner: AztecAddress) {
        debug_log_format("Incrementing counter for other {0}", [owner.to_field()]);

        self.storage.counters.at(owner).add(1).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);

        self.call(Counter::at(other_counter).increment(owner));
    }

    mod test {
        use crate::Counter;
        use aztec::{
            protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
        };

        pub unconstrained fn setup(
            initial_value: u128,
        ) -> (TestEnvironment, AztecAddress, AztecAddress) {
            // Setup env, generate keys
            let mut env = TestEnvironment::new();
            let owner = env.create_light_account();

            // Deploy contract and initialize
            let initializer = Counter::interface().initialize(initial_value as u64, owner);
            let contract_address =
                env.deploy("Counter").with_private_initializer(owner, initializer);
            (env, contract_address, owner)
        }

        #[test]
        unconstrained fn test_increment() {
            let initial_value = 5;
            let (mut env, contract_address, owner) = setup(initial_value);

            // Read the stored value in the note
            let initial_counter =
                env.simulate_utility(Counter::at(contract_address).get_counter(owner));
            assert(
                initial_counter == initial_value,
                f"Expected {initial_value} but got {initial_counter}",
            );

            // Increment the counter
            env.call_private(owner, Counter::at(contract_address).increment(owner));

            let incremented_counter =
                env.simulate_utility(Counter::at(contract_address).get_counter(owner));
            let expected_current_value = initial_value + 1;
            assert(
                expected_current_value == incremented_counter,
                f"Expected {expected_current_value} but got {incremented_counter}",
            );
        }

        #[test]
        unconstrained fn extended_incrementing_and_decrementing() {
            let initial_value = 5;
            let (env, contract_address, owner) = setup(initial_value);

            // Checking that the note was discovered from private logs
            let initial_note_value =
                env.simulate_utility(Counter::at(contract_address).get_counter(owner));
            assert(initial_note_value == initial_value);

            env.call_private(owner, Counter::at(contract_address).increment_twice(owner));

            assert_eq(env.simulate_utility(Counter::at(contract_address).get_counter(owner)), 7);

            let _ = env.call_private(
                owner,
                Counter::at(contract_address).increment_and_decrement(owner),
            );
            assert_eq(env.simulate_utility(Counter::at(contract_address).get_counter(owner)), 7);

            env.call_private(owner, Counter::at(contract_address).decrement(owner));
            assert_eq(env.simulate_utility(Counter::at(contract_address).get_counter(owner)), 6);
        }
    }
}
