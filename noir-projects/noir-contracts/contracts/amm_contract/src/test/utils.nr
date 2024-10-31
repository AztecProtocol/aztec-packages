use crate::AMM;
use dep::token::{test::utils::{check_private_balance, mint_private}, Token};
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

pub unconstrained fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress, Field, Field, Field) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();

    let token_admin = env.create_account_contract(1);
    let liquidity_provider = env.create_account_contract(2);
    let swapper = env.create_account_contract(3);

    // Start the test in the account contract address
    env.impersonate(token_admin);

    // Deploy tokens to be swapped and a liquidity token
    let token0_address = env
        .deploy("./@token_contract", "Token")
        .with_public_void_initializer(Token::interface().constructor(
            token_admin,
            "TestToken0000000000000000000000",
            "TT00000000000000000000000000000",
            18,
        ))
        .to_address();

    let token1_address = env
        .deploy("./@token_contract", "Token")
        .with_public_void_initializer(Token::interface().constructor(
            token_admin,
            "TestToken1000000000000000000000",
            "TT10000000000000000000000000000",
            18,
        ))
        .to_address();

    let liquidity_token_address = env
        .deploy("./@token_contract", "Token")
        .with_public_void_initializer(Token::interface().constructor(
            token_admin,
            "TestLiquidityToken0000000000000",
            "TLT0000000000000000000000000000",
            18,
        ))
        .to_address();

    let amm_address = env
        .deploy_self("AMM")
        .with_public_void_initializer(AMM::interface().constructor(
            token0_address,
            token1_address,
            liquidity_token_address,
        ))
        .to_address();

    // Now we mint both tokens to the liquidity provider and token0 to swapper
    let lp_balance_0 = 20000;
    let lp_balance_1 = 10000;
    let swapper_balance_0 = 5000;

    mint_private(&mut env, token0_address, liquidity_provider, lp_balance_0);
    check_private_balance(token0_address, liquidity_provider, lp_balance_0);

    mint_private(&mut env, token1_address, liquidity_provider, lp_balance_1);
    check_private_balance(token1_address, liquidity_provider, lp_balance_1);

    mint_private(&mut env, token0_address, swapper, swapper_balance_0);
    check_private_balance(token0_address, swapper, swapper_balance_0);

    env.advance_block_by(1);
    (
        &mut env, amm_address, token0_address, token1_address, liquidity_token_address,
        liquidity_provider, swapper, lp_balance_0, lp_balance_1, swapper_balance_0,
    )
}
