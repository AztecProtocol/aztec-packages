use crate::AMM;
use aztec::{
    protocol_types::address::AztecAddress,
    test::helpers::{
        authwit::add_private_authwit_from_call_interface, test_environment::TestEnvironment,
    },
};
use token::Token;

global AUTHWIT_NONCE: Field = 1;

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

pub(crate) unconstrained fn add_liquidity(
    env: TestEnvironment,
    amm_address: AztecAddress,
    token0_address: AztecAddress,
    token1_address: AztecAddress,
    minter: AztecAddress,
    liquidity_provider: AztecAddress,
    amount0_max: u128,
    amount1_max: u128,
    amount0_min: u128,
    amount1_min: u128,
) {
    let token0 = Token::at(token0_address);
    let token1 = Token::at(token1_address);
    let amm = AMM::at(amm_address);

    // Mint tokens to liquidity provider
    env.call_private(minter, token0.mint_to_private(liquidity_provider, amount0_max));
    env.call_private(minter, token1.mint_to_private(liquidity_provider, amount1_max));

    let transfer0_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        amount0_max,
        AUTHWIT_NONCE,
    );
    add_private_authwit_from_call_interface(
        env,
        liquidity_provider,
        amm_address,
        transfer0_call_interface,
    );

    let transfer1_call_interface = token1.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        amount1_max,
        AUTHWIT_NONCE,
    );
    add_private_authwit_from_call_interface(
        env,
        liquidity_provider,
        amm_address,
        transfer1_call_interface,
    );

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, AUTHWIT_NONCE),
    );
}

pub(crate) unconstrained fn remove_liquidity(
    env: TestEnvironment,
    amm_address: AztecAddress,
    liquidity_token_address: AztecAddress,
    liquidity_provider: AztecAddress,
    liquidity_amount: u128,
    amount0_min: u128,
    amount1_min: u128,
) {
    let liquidity_token = Token::at(liquidity_token_address);
    let amm = AMM::at(amm_address);

    let transfer_liquidity_call_interface = liquidity_token.transfer_to_public(
        liquidity_provider,
        amm_address,
        liquidity_amount,
        AUTHWIT_NONCE,
    );
    add_private_authwit_from_call_interface(
        env,
        liquidity_provider,
        amm_address,
        transfer_liquidity_call_interface,
    );

    env.call_private(
        liquidity_provider,
        amm.remove_liquidity(liquidity_amount, amount0_min, amount1_min, AUTHWIT_NONCE),
    );
}
