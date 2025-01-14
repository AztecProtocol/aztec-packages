use dep::aztec::{prelude::AztecAddress, test::helpers::test_environment::TestEnvironment};

use crate::EasyPrivateVoting;

pub fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = unsafe { TestEnvironment::new() };

    let admin = unsafe { env.create_account() };

    let initializer_call_interface = EasyPrivateVoting::interface().constructor(admin);
    let voting_contract = unsafe {
        env.deploy_self("EasyPrivateVoting").with_public_void_initializer(initializer_call_interface)
    };
    // std::println(voting_contract);
    (&mut env, voting_contract.to_address(), admin)
}
