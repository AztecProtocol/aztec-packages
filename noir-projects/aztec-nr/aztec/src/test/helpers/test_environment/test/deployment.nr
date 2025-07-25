use crate::test::helpers::test_environment::TestEnvironment;

#[test]
unconstrained fn deploy_does_not_repeat_addresses() {
    let mut env = TestEnvironment::new();

    // Ideally we'd not rely so much on relative paths and external crates for this test - the Test contract should
    // perhaps be moved to the aztec-nr workspace, but we currently have all contracts in the same workspace to simplify
    // the scripts that build and test them.
    let first_contract = env.deploy("../noir-contracts/@test_contract/Test").without_initializer();
    let second_contract = env.deploy("../noir-contracts/@test_contract/Test").without_initializer();

    // Note that Test _does_ have an initializer, we're not invoking it and then testing calling contract functions
    // because contracts depend on aztec-nr, and so by importing a contract we'd be creating a circular dependency. This
    // at least does test that the basics of the deployment mechanism work.
    assert(first_contract != second_contract);
}
