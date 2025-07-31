use aztec::macros::aztec;

/// Used to test public immutable state variable.
#[aztec]
contract PublicImmutableContract {
    use aztec::{macros::{functions::public, storage::storage}, state_vars::PublicImmutable};

    #[storage]
    struct Storage<Context> {
        immutable_value: PublicImmutable<Field, Context>,
    }

    #[public]
    fn initialize_value(value: Field) {
        storage.immutable_value.initialize(value);
    }

    #[public]
    fn read_value() -> pub Field {
        storage.immutable_value.read()
    }

    #[public]
    fn read_value_unsafe() -> pub Field {
        storage.immutable_value.read_unsafe()
    }
}

mod tests {
    use super::PublicImmutableContract;
    use aztec::{
        protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
    };

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        // Setup test environment
        let mut env = TestEnvironment::new();

        // Deploy contract without initialization
        let contract_address = env.deploy("PublicImmutableContract").without_initializer();

        (env, contract_address)
    }

    #[test]
    unconstrained fn reading_after_initialization_succeeds() {
        let (mut env, contract_address) = setup();
        let test_contract = PublicImmutableContract::at(contract_address);

        // set x to 10
        let x = 10;
        env.call_public(contract_address, test_contract.initialize_value(x));

        // Read value and verify it matches
        assert_eq(env.call_public(contract_address, test_contract.read_value()), x);
    }

    #[test(should_fail_with = "Trying to read from uninitialized PublicImmutable")]
    unconstrained fn reading_uninitialized_immutable_fails() {
        let (env, contract_address) = setup();

        // Try to read uninitialized value - this should fail
        let _ = env.call_public(
            contract_address,
            PublicImmutableContract::at(contract_address).read_value(),
        );
    }

    #[test]
    unconstrained fn unsafe_read_of_uninitialized_immutable_is_zero() {
        let (env, contract_address) = setup();

        // Try to read uninitialized value - this should return 0 as it is the default public storage value
        assert_eq(
            env.call_public(
                contract_address,
                PublicImmutableContract::at(contract_address).read_value_unsafe(),
            ),
            0,
        );
    }
}
