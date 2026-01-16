use crate::{oracle::version::ORACLE_VERSION, test::helpers::test_environment::TestEnvironment};
use std::test::OracleMock;

#[test]
unconstrained fn private_public_and_utility_context_share_default_contract_address() {
    let env = TestEnvironment::new();

    let private_address = env.private_context(|context| context.this_address());
    let public_address = env.public_context(|context| context.this_address());
    let utility_address = env.utility_context(|context| context.this_address());

    assert_eq(private_address, public_address);
    assert_eq(private_address, utility_address);
}

#[test]
unconstrained fn private_public_and_utility_context_share_default_version() {
    let env = TestEnvironment::new();

    let private_version = env.private_context(|context| context.version());
    let public_version = env.public_context(|context| context.version());
    let utility_version = env.utility_context(|context| context.version());

    assert_eq(private_version, public_version);
    assert_eq(private_version, utility_version);
}

#[test]
unconstrained fn private_public_and_utility_context_share_default_chain_id() {
    let env = TestEnvironment::new();

    let private_chain_id = env.private_context(|context| context.chain_id());
    let public_chain_id = env.public_context(|context| context.chain_id());
    let utility_chain_id = env.utility_context(|context| context.chain_id());

    assert_eq(private_chain_id, public_chain_id);
    assert_eq(private_chain_id, utility_chain_id);
}

#[test]
unconstrained fn oracle_version_is_checked_upon_env_creation() {
    let mock = OracleMock::mock("utilityAssertCompatibleOracleVersion");

    let _env = TestEnvironment::new();

    assert_eq(mock.times_called(), 1);
    assert_eq(mock.get_last_params::<Field>(), ORACLE_VERSION);
}
