use crate::AMM;
use aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};
use token::Token;

// Sets up test env with AMM with three tokens and an admin account.
// TODO(#16560): Make it possible to return a contract instance directly from setup func
pub(crate) unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    // Setup admin account
    let admin = env.create_contract_account();

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

    let liquidity_token_initializer = Token::interface().constructor(
        admin,
        "LiquidityToken00000000000000000",
        "LT00000000000000000000000000000",
        18,
    );
    let liquidity_token_address = env.deploy("@token_contract/Token").with_public_initializer(
        admin,
        liquidity_token_initializer,
    );

    // Deploy AMM contract
    let amm_initializer =
        AMM::interface().constructor(token0_address, token1_address, liquidity_token_address);
    let amm_address = env.deploy("AMM").with_public_initializer(admin, amm_initializer);

    // Set AMM as minter for liquidity token
    env.call_public(admin, Token::at(liquidity_token_address).set_minter(amm_address, true));

    // The admin has the minter role. Since we only care about the minting capability in the tests, we return the admin
    // address as 'minter' rather than 'admin'.
    let minter = admin;

    (env, amm_address, token0_address, token1_address, liquidity_token_address, minter)
}
