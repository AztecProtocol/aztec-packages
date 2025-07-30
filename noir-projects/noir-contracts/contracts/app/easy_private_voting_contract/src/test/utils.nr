use dep::aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

use crate::EasyPrivateVoting;

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let admin = env.create_light_account();

    let initializer_call_interface = EasyPrivateVoting::interface().constructor(admin);
    let voting_contract_address =
        env.deploy("EasyPrivateVoting").with_public_initializer(admin, initializer_call_interface);

    env.mine_block();
    (env, voting_contract_address, admin)
}
