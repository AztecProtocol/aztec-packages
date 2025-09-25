use crate::{AMM, test::utils::{add_liquidity, remove_liquidity, setup}};
use aztec::{
    protocol_types::{address::AztecAddress, traits::FromField},
    test::helpers::authwit::add_private_authwit_from_call_interface,
};
use token::Token;

global AUTHWIT_NONCE: Field = 1;
global DEFAULT_AMOUNT_0_MIN: u128 = 0;
global DEFAULT_AMOUNT_1_MIN: u128 = 0;

#[test]
unconstrained fn add_liquidity_twice_and_remove_liquidity() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, minter) =
        setup();

    let liquidity_provider_1 = env.create_contract_account();
    let liquidity_provider_2 = env.create_contract_account();

    let token0 = Token::at(token0_address);
    let token1 = Token::at(token1_address);
    let liquidity_token = Token::at(liquidity_token_address);

    // ADDING INITIAL LIQUIDITY
    let initial_amount0 = 1000 as u128;
    let initial_amount1 = 2000 as u128;

    add_liquidity(
        env,
        amm_address,
        token0_address,
        token1_address,
        minter,
        liquidity_provider_1,
        initial_amount0,
        initial_amount1,
        DEFAULT_AMOUNT_0_MIN,
        DEFAULT_AMOUNT_1_MIN,
    );

    // We verify the initial liquidity token supply is as expected as we will need the value later on to calculate
    // the expected tokens received.
    let initial_liquidity_token_supply = env.view_public(liquidity_token.total_supply());
    assert_eq(initial_liquidity_token_supply, AMM::MINIMUM_LIQUIDITY + AMM::INITIAL_LIQUIDITY);

    // ADDING LIQUIDITY AGAIN
    let expected_amount_0_in = initial_amount0 / 2;
    // The amount of token1 that is expected to be deposited.
    let expected_amount_1_in = initial_amount1 / 2;
    // We intentionally set the amount1_max to be higher than the liquidity ration to check that we get a refund.
    let expected_refund_amount1 = 200 as u128;
    let amount1_max = expected_amount_1_in + expected_refund_amount1;

    add_liquidity(
        env,
        amm_address,
        token0_address,
        token1_address,
        minter,
        liquidity_provider_2,
        expected_amount_0_in,
        amount1_max,
        DEFAULT_AMOUNT_0_MIN,
        DEFAULT_AMOUNT_1_MIN,
    );

    // Verify balances after adding liquidity
    // AMM should have received 500 token0 and 1000 token1 (not 1200, as excess is refunded)
    assert_eq(
        env.view_public(token0.balance_of_public(amm_address)),
        initial_amount0 + expected_amount_0_in,
    );
    assert_eq(
        env.view_public(token1.balance_of_public(amm_address)),
        initial_amount1 + expected_amount_1_in,
    );

    // Liquidity provider 2 should have 0 token0 and the refund amount of token1
    assert_eq(env.simulate_utility(token0.balance_of_private(liquidity_provider_2)), 0);
    assert_eq(
        env.simulate_utility(token1.balance_of_private(liquidity_provider_2)),
        expected_refund_amount1,
    );

    // Check liquidity provider 2 received liquidity tokens proportional to their contribution
    let expected_liquidity_tokens =
        (expected_amount_0_in * initial_liquidity_token_supply) / initial_amount0;
    assert_eq(
        env.simulate_utility(liquidity_token.balance_of_private(liquidity_provider_2)),
        expected_liquidity_tokens,
    );

    // REMOVING LIQUIDITY
    let liquidity_to_remove = AMM::INITIAL_LIQUIDITY / 2;
    let amount0_min = 400 as u128;
    let amount1_min = 800 as u128;

    remove_liquidity(
        env,
        amm_address,
        liquidity_token_address,
        liquidity_provider_1,
        liquidity_to_remove,
        amount0_min,
        amount1_min,
    );

    // Verify liquidity provider 1 got tokens back (proportional to liquidity burned)
    let expected_token0_back =
        (liquidity_to_remove * initial_amount0) / initial_liquidity_token_supply;
    let expected_token1_back =
        (liquidity_to_remove * initial_amount1) / initial_liquidity_token_supply;
    assert_eq(
        env.simulate_utility(token0.balance_of_private(liquidity_provider_1)),
        expected_token0_back,
    );
    assert_eq(
        env.simulate_utility(token1.balance_of_private(liquidity_provider_1)),
        expected_token1_back,
    );

    // Check remaining liquidity tokens
    assert_eq(
        env.simulate_utility(liquidity_token.balance_of_private(liquidity_provider_1)),
        // The expected remaining liquidity is the other half of the initial liquidity.
        AMM::INITIAL_LIQUIDITY / 2,
    );
}

#[test]
unconstrained fn swap_exact_tokens_for_tokens() {
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, minter) =
        setup();

    let liquidity_provider = env.create_contract_account();
    let swapper = env.create_contract_account();

    let token0 = Token::at(token0_address);
    let token1 = Token::at(token1_address);
    let amm = AMM::at(amm_address);

    // First add liquidity to the pool
    let liquidity_amount0 = 10000 as u128;
    let liquidity_amount1 = 20000 as u128;

    add_liquidity(
        env,
        amm_address,
        token0_address,
        token1_address,
        minter,
        liquidity_provider,
        liquidity_amount0,
        liquidity_amount1,
        DEFAULT_AMOUNT_0_MIN,
        DEFAULT_AMOUNT_1_MIN,
    );

    // Now perform a swap
    let amount_in = 1000 as u128;
    let amount_out_min = 1800 as u128; // Expect ~1814 with 0.3% fee

    env.call_private(minter, token0.mint_to_private(swapper, amount_in));

    // Create authwit for transferring tokens to AMM
    add_private_authwit_from_call_interface(
        env,
        swapper,
        amm_address,
        token0.transfer_to_public(swapper, amm_address, amount_in, AUTHWIT_NONCE),
    );

    env.call_private(
        swapper,
        amm.swap_exact_tokens_for_tokens(
            token0_address,
            token1_address,
            amount_in,
            amount_out_min,
            AUTHWIT_NONCE,
        ),
    );

    // Verify swap occurred - all of input tokens should be spent and hence the swapper should have 0 token0 balance.
    assert_eq(env.simulate_utility(token0.balance_of_private(swapper)), 0);
    // The exact amount out depends on the AMM formula, but should be > amount_out_min
    assert(env.simulate_utility(token1.balance_of_private(swapper)) >= amount_out_min);
}

#[test]
unconstrained fn swap_tokens_for_exact_tokens() {
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, minter) =
        setup();

    let liquidity_provider = env.create_contract_account();
    let swapper = env.create_contract_account();

    let token0 = Token::at(token0_address);
    let token1 = Token::at(token1_address);
    let amm = AMM::at(amm_address);

    // First add liquidity to the pool
    let liquidity_amount0 = 10000 as u128;
    let liquidity_amount1 = 20000 as u128;

    add_liquidity(
        env,
        amm_address,
        token0_address,
        token1_address,
        minter,
        liquidity_provider,
        liquidity_amount0,
        liquidity_amount1,
        DEFAULT_AMOUNT_0_MIN,
        DEFAULT_AMOUNT_1_MIN,
    );

    // Now perform a swap for exact tokens out
    let amount_out = 1000 as u128;
    let amount_in_max = 600 as u128; // Should need ~503 tokens in with 0.3% fee

    env.call_private(minter, token0.mint_to_private(swapper, amount_in_max));

    // Create authwit for transferring tokens to AMM
    let transfer_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        swapper,
        amm_address,
        amount_in_max,
        AUTHWIT_NONCE,
    );
    add_private_authwit_from_call_interface(env, swapper, amm_address, transfer_call_interface);

    env.call_private(
        swapper,
        amm.swap_tokens_for_exact_tokens(
            token0_address,
            token1_address,
            amount_out,
            amount_in_max,
            AUTHWIT_NONCE,
        ),
    );

    // Verify swap occurred - should get exact amount out
    assert_eq(env.simulate_utility(token1.balance_of_private(swapper)), amount_out);
    // Should have some token0 change returned
    let swapper_token0_balance = env.simulate_utility(token0.balance_of_private(swapper));
    assert(swapper_token0_balance > 0);
    assert(swapper_token0_balance < amount_in_max);
}

#[test(should_fail_with = "INCORRECT_TOKEN0_LIMITS")]
unconstrained fn add_liquidity_incorrect_token0_limits() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, _minter)
         = setup();

    let liquidity_provider = env.create_contract_account();
    let amm = AMM::at(amm_address);

    // amount0_min > amount0_max should fail
    let amount0_max = 500 as u128;
    let amount1_max = 1000 as u128;
    let amount0_min = 600 as u128; // Invalid: min > max
    let amount1_min = 500 as u128;

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, AUTHWIT_NONCE),
    );
}

#[test(should_fail_with = "INCORRECT_TOKEN1_LIMITS")]
unconstrained fn add_liquidity_incorrect_token1_limits() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, _minter)
         = setup();

    let liquidity_provider = env.create_contract_account();
    let amm = AMM::at(amm_address);

    // amount1_min > amount1_max should fail
    let amount0_max = 500 as u128;
    let amount1_max = 1000 as u128;
    let amount0_min = 400 as u128;
    let amount1_min = 1100 as u128; // Invalid: min > max

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, AUTHWIT_NONCE),
    );
}

#[test(should_fail_with = "INSUFFICIENT_INPUT_AMOUNTS")]
unconstrained fn add_liquidity_zero_amount0_max() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, _minter)
         = setup();

    let liquidity_provider = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let amount0_max = 0 as u128; // Invalid: zero amount
    let amount1_max = 1000 as u128;
    let amount0_min = 0 as u128;
    let amount1_min = 500 as u128;

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, AUTHWIT_NONCE),
    );
}

#[test(should_fail_with = "INSUFFICIENT_INPUT_AMOUNTS")]
unconstrained fn add_liquidity_zero_amount1_max() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, _minter)
         = setup();

    let liquidity_provider = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let amount0_max = 1000 as u128;
    let amount1_max = 0 as u128; // Invalid: zero amount
    let amount0_min = 500 as u128;
    let amount1_min = 0 as u128;

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, AUTHWIT_NONCE),
    );
}

#[test(should_fail_with = "TOKEN_IN_IS_INVALID")]
unconstrained fn swap_exact_tokens_invalid_token_in() {
    let (mut env, amm_address, _token0_address, token1_address, _liquidity_token_address, _minter)
         = setup();

    let swapper = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let invalid_token = AztecAddress::from_field(999);
    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;

    env.call_private(
        swapper,
        amm.swap_exact_tokens_for_tokens(
            invalid_token,
            token1_address,
            amount_in,
            amount_out_min,
            AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "TOKEN_OUT_IS_INVALID")]
unconstrained fn swap_exact_tokens_invalid_token_out() {
    let (mut env, amm_address, token0_address, _token1_address, _liquidity_token_address, _minter)
         = setup();

    let swapper = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let invalid_token = AztecAddress::from_field(999);
    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;

    env.call_private(
        swapper,
        amm.swap_exact_tokens_for_tokens(
            token0_address,
            invalid_token,
            amount_in,
            amount_out_min,
            AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "SAME_TOKEN_SWAP")]
unconstrained fn swap_exact_tokens_same_tokens() {
    let (mut env, amm_address, token0_address, _token1_address, _liquidity_token_address, _minter)
         = setup();

    let swapper = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;

    env.call_private(
        swapper,
        amm.swap_exact_tokens_for_tokens(
            token0_address,
            token0_address, // Same token for in and out
            amount_in,
            amount_out_min,
            AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "TOKEN_IN_IS_INVALID")]
unconstrained fn swap_tokens_for_exact_invalid_token_in() {
    let (mut env, amm_address, _token0_address, token1_address, _liquidity_token_address, _minter)
         = setup();

    let swapper = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let invalid_token = AztecAddress::from_field(999);
    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;

    env.call_private(
        swapper,
        amm.swap_tokens_for_exact_tokens(
            invalid_token,
            token1_address,
            amount_out,
            amount_in_max,
            AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "TOKEN_OUT_IS_INVALID")]
unconstrained fn swap_tokens_for_exact_invalid_token_out() {
    let (mut env, amm_address, token0_address, _token1_address, _liquidity_token_address, _minter)
         = setup();

    let swapper = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let invalid_token = AztecAddress::from_field(999);
    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;

    env.call_private(
        swapper,
        amm.swap_tokens_for_exact_tokens(
            token0_address,
            invalid_token,
            amount_out,
            amount_in_max,
            AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "SAME_TOKEN_SWAP")]
unconstrained fn swap_tokens_for_exact_same_tokens() {
    let (mut env, amm_address, token0_address, _token1_address, _liquidity_token_address, _minter)
         = setup();

    let swapper = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;

    env.call_private(
        swapper,
        amm.swap_tokens_for_exact_tokens(
            token0_address,
            token0_address, // Same token for in and out
            amount_out,
            amount_in_max,
            AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "INSUFFICIENT_LIQUIDITY_MINTED")]
unconstrained fn add_liquidity_insufficient_liquidity_minted() {
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, minter) =
        setup();

    let liquidity_provider_1 = env.create_contract_account();
    let liquidity_provider_2 = env.create_contract_account();

    // Add initial liquidity first
    let initial_amount0 = 100000000 as u128; // Very large amount
    let initial_amount1 = 200000000 as u128;

    add_liquidity(
        env,
        amm_address,
        token0_address,
        token1_address,
        minter,
        liquidity_provider_1,
        initial_amount0,
        initial_amount1,
        DEFAULT_AMOUNT_0_MIN,
        DEFAULT_AMOUNT_1_MIN,
    );

    // Now try to add very small liquidity that would result in 0 liquidity tokens
    let tiny_amount0 = 1 as u128; // Very small amount
    let tiny_amount1 = 2 as u128;

    add_liquidity(
        env,
        amm_address,
        token0_address,
        token1_address,
        minter,
        liquidity_provider_2,
        tiny_amount0,
        tiny_amount1,
        DEFAULT_AMOUNT_0_MIN,
        DEFAULT_AMOUNT_1_MIN,
    );
}

#[test(should_fail_with = "INSUFFICIENT_0_AMOUNT")]
unconstrained fn remove_liquidity_insufficient_amount0() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, minter) =
        setup();

    let liquidity_provider = env.create_contract_account();

    // Add liquidity first
    let amount0 = 1000 as u128;
    let amount1 = 2000 as u128;

    add_liquidity(
        env,
        amm_address,
        token0_address,
        token1_address,
        minter,
        liquidity_provider,
        amount0,
        amount1,
        DEFAULT_AMOUNT_0_MIN,
        DEFAULT_AMOUNT_1_MIN,
    );

    // Try to remove liquidity with unrealistic minimum expectations
    let liquidity_to_remove = AMM::INITIAL_LIQUIDITY / 2;
    let amount0_min = 10000 as u128; // Unrealistically high minimum
    let amount1_min = 800 as u128;

    remove_liquidity(
        env,
        amm_address,
        liquidity_token_address,
        liquidity_provider,
        liquidity_to_remove,
        amount0_min,
        amount1_min,
    );
}

#[test(should_fail_with = "INSUFFICIENT_1_AMOUNT")]
unconstrained fn remove_liquidity_insufficient_amount1() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, minter) =
        setup();

    let liquidity_provider = env.create_contract_account();

    // Add liquidity first
    let amount0 = 1000 as u128;
    let amount1 = 2000 as u128;

    add_liquidity(
        env,
        amm_address,
        token0_address,
        token1_address,
        minter,
        liquidity_provider,
        amount0,
        amount1,
        DEFAULT_AMOUNT_0_MIN,
        DEFAULT_AMOUNT_1_MIN,
    );

    // Try to remove liquidity with unrealistic minimum expectations
    let liquidity_to_remove = AMM::INITIAL_LIQUIDITY / 2;
    let amount0_min = 400 as u128;
    let amount1_min = 20000 as u128; // Unrealistically high minimum

    remove_liquidity(
        env,
        amm_address,
        liquidity_token_address,
        liquidity_provider,
        liquidity_to_remove,
        amount0_min,
        amount1_min,
    );
}
