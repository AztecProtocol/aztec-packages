use dep::aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

use crate::EasyPrivateVoting;

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let env = TestEnvironment::new();

    let admin = env.create_account(1);

    let initializer_call_interface = EasyPrivateVoting::interface().constructor(admin);
    let voting_contract = env.deploy_self("EasyPrivateVoting").with_public_initializer(
        admin,
        initializer_call_interface,
    );

    env.mine_block();
    (env, voting_contract.to_address(), admin)
}
