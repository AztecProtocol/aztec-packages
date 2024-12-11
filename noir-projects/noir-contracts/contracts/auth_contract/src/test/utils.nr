use dep::aztec::{prelude::AztecAddress, test::helpers::test_environment::TestEnvironment};

use crate::Auth;

pub unconstrained fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let admin = env.create_account();
    let to_authorize = env.create_account();
    let other = env.create_account();

    let initializer_call_interface = Auth::interface().constructor(admin);

    let auth_contract =
        env.deploy_self("Auth").with_public_void_initializer(initializer_call_interface);
    let auth_contract_address = auth_contract.to_address();
    env.advance_block_by(1);
    (&mut env, auth_contract_address, admin, to_authorize, other)
}
