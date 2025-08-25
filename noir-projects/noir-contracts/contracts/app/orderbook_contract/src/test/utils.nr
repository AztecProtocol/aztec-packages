use crate::Orderbook;
use aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};
use token::Token;

// Utility function to setup orderbook with two tokens
// TODO(#16560): Make it possible to return a contract instance directly from setup func
pub(crate) unconstrained fn setup(
    with_account_contracts: bool,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    // Setup accounts
    let admin = if with_account_contracts {
        env.create_contract_account()
    } else {
        env.create_light_account()
    };

    let maker = if with_account_contracts {
        env.create_contract_account()
    } else {
        env.create_light_account()
    };

    // Deploy tokens
    let token0_initializer = Token::interface().constructor(
        admin,
        "Token00000000000000000000000000",
        "TK00000000000000000000000000000",
        18,
    );
    let token0_address =
        env.deploy("@token_contract/Token").with_public_initializer(admin, token0_initializer);

    let token1_initializer = Token::interface().constructor(
        admin,
        "Token11111111111111111111111111",
        "TK11111111111111111111111111111",
        18,
    );
    let token1_address =
        env.deploy("@token_contract/Token").with_public_initializer(admin, token1_initializer);

    // Deploy orderbook contract
    let orderbook_initializer = Orderbook::interface().constructor(token0_address, token1_address);
    let orderbook_address =
        env.deploy("Orderbook").with_public_initializer(admin, orderbook_initializer);

    // The admin has the minter role. Since we only care about the minting capability in the tests, we return the admin
    // address as 'minter' rather than 'admin'.
    let minter = admin;

    (env, orderbook_address, token0_address, token1_address, minter, maker)
}
