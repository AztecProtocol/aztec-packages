use crate::{
    oracle::get_contract_instance::get_contract_instance,
    test::helpers::test_environment::{DeployOptions, TestEnvironment},
};

#[test]
unconstrained fn deploy_does_not_repeat_addresses() {
    let mut env = TestEnvironment::new();

    // Ideally we'd not rely so much on relative paths and external crates for this test - the Test contract should
    // perhaps be moved to the aztec-nr workspace, but we currently have all contracts in the same workspace to
    // simplify the scripts that build and test them.
    let first_contract = env.deploy("../noir-contracts/@test_contract/Test").without_initializer();
    let second_contract = env.deploy("../noir-contracts/@test_contract/Test").without_initializer();

    // Note that Test _does_ have an initializer, we're not invoking it and then testing calling contract functions
    // because contracts depend on aztec-nr, and so by importing a contract we'd be creating a circular dependency.
    // This at least does test that the basics of the deployment mechanism work.
    assert(first_contract != second_contract);
}

#[test(should_fail_with = "NullifierTree")]
unconstrained fn deploy_with_same_salt_and_secret_fails() {
    let mut env = TestEnvironment::new();

    let opts = DeployOptions::new().with_salt(42).with_secret(100);

    let _ = env.deploy_opts(opts, "../noir-contracts/@test_contract/Test").without_initializer();
    // This will result in the exact same address preimage and hence same address, and so the initialization
    // nullifiers will be duplicated.
    let _ = env.deploy_opts(opts, "../noir-contracts/@test_contract/Test").without_initializer();
}

#[test]
unconstrained fn deploy_with_same_salt_does_not_repeat_addresses() {
    let mut env = TestEnvironment::new();

    let first_contract = env
        .deploy_opts(DeployOptions::new().with_salt(42).with_secret(100), "../noir-contracts/@test_contract/Test")
        .without_initializer();
    let second_contract = env
        .deploy_opts(DeployOptions::new().with_salt(42).with_secret(200), "../noir-contracts/@test_contract/Test")
        .without_initializer();

    assert(first_contract != second_contract);
}

#[test]
unconstrained fn deploy_with_same_secret_does_not_repeat_addresses() {
    let mut env = TestEnvironment::new();

    let first_contract = env
        .deploy_opts(DeployOptions::new().with_salt(42).with_secret(100), "../noir-contracts/@test_contract/Test")
        .without_initializer();
    let second_contract = env
        .deploy_opts(DeployOptions::new().with_salt(43).with_secret(100), "../noir-contracts/@test_contract/Test")
        .without_initializer();

    assert(first_contract != second_contract);
}

#[test]
unconstrained fn deploy_with_immutables_hash_sets_instance_immutables_hash() {
    let mut env = TestEnvironment::new();

    let contract_address = env
        .deploy_opts(DeployOptions::new().with_immutables_hash(42), "../noir-contracts/@test_contract/Test")
        .without_initializer();

    env.utility_context_at(contract_address, |_| {
        assert_eq(get_contract_instance(contract_address).immutables_hash, 42);
    });
}

#[test]
unconstrained fn deploy_with_different_immutables_hash_does_not_repeat_addresses() {
    let mut env = TestEnvironment::new();

    let first_contract = env
        .deploy_opts(
            DeployOptions::new().with_salt(42).with_secret(100).with_immutables_hash(1),
            "../noir-contracts/@test_contract/Test",
        )
        .without_initializer();
    let second_contract = env
        .deploy_opts(
            DeployOptions::new().with_salt(42).with_secret(100).with_immutables_hash(2),
            "../noir-contracts/@test_contract/Test",
        )
        .without_initializer();

    assert(first_contract != second_contract);
}
