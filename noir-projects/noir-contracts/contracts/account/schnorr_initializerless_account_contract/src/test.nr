use crate::SchnorrInitializerlessAccount;
use aztec::{
    protocol::{address::AztecAddress, hash::poseidon2_hash},
    test::helpers::test_environment::{DeployOptions, TestEnvironment},
};

global SIGNING_PUB_KEY_X: Field = 1;
global SIGNING_PUB_KEY_Y: Field = 2;

#[test]
unconstrained fn constructor_accepts_key_matching_immutables_hash() {
    let (env, account) = deploy_with_immutables_hash(poseidon2_hash([SIGNING_PUB_KEY_X, SIGNING_PUB_KEY_Y]));

    env.execute_utility(SchnorrInitializerlessAccount::at(account).constructor(SIGNING_PUB_KEY_X, SIGNING_PUB_KEY_Y));
}

#[test(should_fail_with = "Public key hash does not match the immutables hash")]
unconstrained fn constructor_rejects_key_not_matching_immutables_hash() {
    let (env, account) = deploy_with_immutables_hash(poseidon2_hash([SIGNING_PUB_KEY_X, SIGNING_PUB_KEY_Y + 1]));

    env.execute_utility(SchnorrInitializerlessAccount::at(account).constructor(SIGNING_PUB_KEY_X, SIGNING_PUB_KEY_Y));
}

unconstrained fn deploy_with_immutables_hash(immutables_hash: Field) -> (TestEnvironment, AztecAddress) {
    let mut env = TestEnvironment::new();
    let account = env
        .deploy_opts(DeployOptions::new().with_immutables_hash(immutables_hash), "SchnorrInitializerlessAccount")
        .without_initializer();
    (env, account)
}
