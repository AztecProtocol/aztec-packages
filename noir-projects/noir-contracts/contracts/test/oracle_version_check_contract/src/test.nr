use aztec::oracle::version::ORACLE_VERSION;
use aztec::test::helpers::test_environment::TestEnvironment;
use std::test::OracleMock;

use crate::OracleVersionCheck;

#[test]
unconstrained fn oracle_version_is_checked_when_private_function_is_called() {
    // We mock the oracle to be able to check that it gets called and that it gets called with the correct version
    let mock = OracleMock::mock("utilityAssertOracleVersionMatches");

    // Create test environment and deploy the contract
    let mut env = TestEnvironment::new();
    let caller = env.create_light_account();
    let contract_address = env.deploy("OracleVersionCheck").without_initializer();

    // Calling the private function should trigger the oracle version check
    let _result =
        env.call_private(caller, OracleVersionCheck::at(contract_address).private_function());

    assert_eq(mock.times_called(), 1, "Expected oracle version check to be called exactly once");
    assert_eq(
        mock.get_last_params::<Field>(),
        ORACLE_VERSION,
        "Oracle called with unexpected version",
    );
}

#[test]
unconstrained fn oracle_version_is_checked_when_utility_function_is_called() {
    // We mock the oracle to be able to check that it gets called and that it gets called with the correct version
    let mock = OracleMock::mock("utilityAssertOracleVersionMatches");

    // Create test environment and deploy the contract
    let mut env = TestEnvironment::new();
    let contract_address = env.deploy("OracleVersionCheck").without_initializer();

    // Calling the utility function should trigger the oracle version check
    let _result = env.simulate_utility(OracleVersionCheck::at(contract_address).utility_function());

    assert_eq(mock.times_called(), 1, "Expected oracle version check to be called exactly once");
    assert_eq(
        mock.get_last_params::<Field>(),
        ORACLE_VERSION,
        "Oracle called with unexpected version",
    );
}
