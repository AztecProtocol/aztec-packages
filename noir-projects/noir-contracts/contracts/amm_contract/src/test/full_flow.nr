use crate::{AMM, test::utils::setup};
use dep::authwit::cheatcodes::add_private_authwit_from_call_interface;
use dep::token::{test::utils::{add_token_note, check_private_balance, check_public_balance}, Token};
use aztec::oracle::random::random;
use std::test::OracleMock;

#[test]
unconstrained fn full_flow() {
    // Setup
    let (env, amm_address, token0_address, token1_address, liquidity_token_address, liquidity_provider, swapper, lp_balance_0, lp_balance_1, swapper_balance_0) =
        setup();
    let amm = AMM::at(amm_address);

    // ADDING LIQUIDITY
    // Ideally we would like to deposit all the tokens from the liquidity provider
    let amount0_desired = lp_balance_0;
    let amount1_desired = lp_balance_1;
    let amount0_min = lp_balance_0 / 2;
    let amount1_min = lp_balance_1 / 2;

    // First we need to add authwits such that the AMM can transfer the tokens from the liquidity provider
    // The only purpose of this nonce is to make the authwit unique (function args are part of authwit hash preimage)
    let nonce_for_authwits = random();
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        Token::at(token0_address).transfer_to_public(
            liquidity_provider,
            amm_address,
            amount0_desired,
            nonce_for_authwits,
        ),
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        Token::at(token1_address).transfer_to_public(
            liquidity_provider,
            amm_address,
            amount1_desired,
            nonce_for_authwits,
        ),
    );

    // We fix the note randomness as we need to add the notes manually. This will go away once #8771 is implemented.
    let note_randomness = random();
    let _ = OracleMock::mock("getRandomField").returns(note_randomness);

    // Now we can add liquidity
    amm
        .add_liquidity(
            amount0_desired,
            amount1_desired,
            amount0_min,
            amount1_min,
            nonce_for_authwits,
        )
        .call(&mut env.private());

    // Since there was no liquidity in the pool before the pool should take the desired amounts of tokens in public
    // The AMM should therefore hold the desired amounts
    check_public_balance(token0_address, amm_address, amount0_desired);
    check_public_balance(token1_address, amm_address, amount1_desired);

    // Initial liquidity amount of liquidity token should have been minted to the liquidity provider
    // Since it was minted in private and #8771 is not yet implemented we need to add the note
    add_token_note(
        env,
        liquidity_token_address,
        liquidity_provider,
        AMM::INITIAL_LIQUIDITY.to_integer(),
        note_randomness,
    );
    check_private_balance(
        liquidity_token_address,
        liquidity_provider,
        AMM::INITIAL_LIQUIDITY.to_integer(),
    );

    // The AMM should have locked minimum liquidity to itself in public
    check_public_balance(
        liquidity_token_address,
        amm_address,
        AMM::MINIMUM_LIQUIDITY.to_integer(),
    );

    // SWAPPING
    // Now we will try to swap the full balance of the swapper
    let amount_in = swapper_balance_0;
    // We don't care about slippage protection here so we set out min to 0
    let amount_out_min = 0;

    // We need to add authwits such that the AMM can transfer the tokens from the swapper
    add_private_authwit_from_call_interface(
        swapper,
        amm_address,
        Token::at(token0_address).transfer_to_public(
            swapper,
            amm_address,
            amount_in,
            nonce_for_authwits,
        ),
    );

    // Now we can swap
    amm
        .swap_exact_tokens_for_tokens(
            token0_address,
            token1_address,
            amount_in,
            amount_out_min,
            nonce_for_authwits,
        )
        .call(&mut env.private());
}
