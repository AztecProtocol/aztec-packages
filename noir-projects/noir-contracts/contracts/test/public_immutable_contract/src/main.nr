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
    use aztec::{prelude::AztecAddress, test::helpers::test_environment::TestEnvironment};

    unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
        // Setup test environment
        let mut env = TestEnvironment::new();

        // Deploy contract without initialization
        let contract_address =
            env.deploy_self("PublicImmutableContract").without_initializer().to_address();

        (env, contract_address)
    }

    #[test]
    unconstrained fn reading_after_initialization_succeeds() {
        let (mut env, contract_address) = setup();
        let test_contract = PublicImmutableContract::at(contract_address);

        // set x to 10
        let x = 10;
        test_contract.initialize_value(x).call(&mut env.public());

        // We advance block to commit state and have the nullifier available for reading.
        env.advance_block_by(1);

        // Read value and verify it matches
        let read_value = test_contract.read_value().call(&mut env.public());
        assert(read_value == x);
    }

    #[test(should_fail_with = "Trying to read from uninitialized PublicImmutable")]
    unconstrained fn reading_uninitialized_immutable_fails() {
        let (env, contract_address) = setup();

        // Try to read uninitialized value - this should fail
        let _ = PublicImmutableContract::at(contract_address).read_value().call(&mut env.public());
    }

    #[test]
    unconstrained fn unsafe_read_of_uninitialized_immutable_is_zero() {
        let (env, contract_address) = setup();

        // Try to read uninitialized value - this should return 0 as it is the default public storage value
        let value = PublicImmutableContract::at(contract_address).read_value_unsafe().call(
            &mut env.public(),
        );
        assert(value == 0);
    }
}
