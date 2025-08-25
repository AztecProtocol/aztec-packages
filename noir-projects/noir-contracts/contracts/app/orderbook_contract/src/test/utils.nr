use crate::Orderbook;
use aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};
use token::Token;

// Utility function to setup two token contracts
// TODO(#16560): Make it possible to return a contract instance directly from setup func
unconstrained fn setup_tokens(
    env: &mut TestEnvironment,
    admin: AztecAddress,
) -> (AztecAddress, AztecAddress) {
    // Deploy first token contract
    let token0_initializer = Token::interface().constructor(
        admin,
        "Token00000000000000000000000000",
        "TK00000000000000000000000000000",
        18,
    );
    let token0_address =
        env.deploy("@token_contract/Token").with_public_initializer(admin, token0_initializer);

    // Deploy second token contract
    let token1_initializer = Token::interface().constructor(
        admin,
        "Token11111111111111111111111111",
        "TK11111111111111111111111111111",
        18,
    );
    let token1_address =
        env.deploy("@token_contract/Token").with_public_initializer(admin, token1_initializer);

    (token0_address, token1_address)
}

// Utility function to setup orderbook with two tokens
pub(crate) unconstrained fn setup_orderbook_with_tokens(
    with_account_contracts: bool,
) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
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

    let (token0_address, token1_address) = setup_tokens(&mut env, admin);

    // Deploy orderbook contract
    let orderbook_initializer = Orderbook::interface().constructor(token0_address, token1_address);
    let orderbook_address =
        env.deploy("Orderbook").with_public_initializer(admin, orderbook_initializer);

    // Admin has minter role and since where this function is used we care about minter role and not about admin role
    // we name the return value a minter.
    let minter = admin;

    (env, orderbook_address, token0_address, token1_address, minter, maker)
}
