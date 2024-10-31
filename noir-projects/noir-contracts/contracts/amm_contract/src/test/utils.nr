use dep::uint_note::uint_note::UintNote;
use dep::token::Token;
use aztec::{
    keys::getters::get_public_keys,
    oracle::{
        execution::{get_block_number, get_contract_address},
        random::random,
        storage::storage_read,
    },
    prelude::AztecAddress,
    protocol_types::storage::map::derive_storage_slot_in_map,
    test::helpers::{cheatcodes, test_environment::TestEnvironment},
};
use crate::AMM;

pub unconstrained fn setup(
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress, Field, Field, Field) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();

    let token_admin = env.create_account_contract(1);
    let liquidity_provider = env.create_account_contract(2);
    let swapper = env.create_account_contract(2);

    // Start the test in the account contract address
    env.impersonate(token_admin);

    // Deploy tokens to be swapped and a liquidity token
    let token0 =
        env.deploy_self("Token").with_public_void_initializer(Token::interface().constructor(
        token_admin,
        "TestToken0000000000000000000000",
        "TT00000000000000000000000000000",
        18,
    ));
    let token0_address = token0.to_address();

    let token1 =
        env.deploy_self("Token").with_public_void_initializer(Token::interface().constructor(
        token_admin,
        "TestToken1000000000000000000000",
        "TT10000000000000000000000000000",
        18,
    ));
    let token1_address = token1.to_address();

    let liquidity_token =
        env.deploy_self("Token").with_public_void_initializer(Token::interface().constructor(
        token_admin,
        "TestLiquidityToken0000000000000",
        "TLT0000000000000000000000000000",
        18,
    ));
    let liquidity_token_address = liquidity_token.to_address();

    let amm = env.deploy_self("AMM").with_public_void_initializer(AMM::interface().constructor(
        token0_address,
        token1_address,
        liquidity_token_address,
    ));
    let amm_address = amm.to_address();

    // Now we mint both tokens to the liquidity provider and token0 to swapper
    let lp_balance_0 = 20000;
    let lp_balance_1 = 10000;
    let swapper_balance_0 = 5000;

    token0.mint_to_private(liquidity_provider, lp_balance_0).call(
        &mut env.private(),
    );
    token1.mint_to_private(liquidity_provider, lp_balance_1).call(
        &mut env.private(),
    );
    token0.mint_private(swapper, swapper_balance_0).call(
        &mut env.private(),
    );


    env.advance_block_by(1);
    (&mut env, amm_address, token0_address, token1_address, liquidity_token_address, token_admin, liquidity_provider, lp_balance_0, lp_balance_1, swapper_balance_0)
}