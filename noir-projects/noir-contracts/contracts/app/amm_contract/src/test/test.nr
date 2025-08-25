use crate::{AMM, test::utils::setup};
use aztec::{
    protocol_types::{address::AztecAddress, traits::FromField},
    test::helpers::authwit::add_private_authwit_from_call_interface,
};
use token::Token;

#[test]
unconstrained fn add_liquidity_twice_and_remove_liquidity_happy_path() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, minter) =
        setup();

    let liquidity_provider_1 = env.create_contract_account();
    let liquidity_provider_2 = env.create_contract_account();

    let token0 = Token::at(token0_address);
    let token1 = Token::at(token1_address);
    let liquidity_token = Token::at(liquidity_token_address);
    let amm = AMM::at(amm_address);

    // First add initial liquidity from minter
    let initial_amount0 = 1000 as u128;
    let initial_amount1 = 2000 as u128;

    env.call_private(minter, token0.mint_to_private(liquidity_provider_1, initial_amount0));
    env.call_private(minter, token1.mint_to_private(liquidity_provider_1, initial_amount1));

    let transfer0_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider_1,
        amm_address,
        initial_amount0,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider_1,
        amm_address,
        transfer0_call_interface,
    );

    let transfer1_call_interface = token1.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider_1,
        amm_address,
        initial_amount1,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider_1,
        amm_address,
        transfer1_call_interface,
    );

    env.call_private(
        liquidity_provider_1,
        amm.add_liquidity(initial_amount0, initial_amount1, 0, 0, 1),
    );

    // Add liquidity from liquidity provider 2 with excess token1
    let amount0_max = 500 as u128;
    let amount1_max = 1200 as u128; // Intentionally higher than 1:2 ratio to test we get a refund
    let amount0_min = 400 as u128;
    let amount1_min = 800 as u128;
    let authwit_nonce = 2;

    env.call_private(minter, token0.mint_to_private(liquidity_provider_2, amount0_max));
    env.call_private(minter, token1.mint_to_private(liquidity_provider_2, amount1_max));

    let transfer0_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider_2,
        amm_address,
        amount0_max,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider_2,
        amm_address,
        transfer0_call_interface,
    );

    let transfer1_call_interface = token1.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider_2,
        amm_address,
        amount1_max,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider_2,
        amm_address,
        transfer1_call_interface,
    );

    env.call_private(
        liquidity_provider_2,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, authwit_nonce),
    );

    // Verify balances after adding liquidity
    // AMM should have received 500 token0 and 1000 token1 (not 1200, as excess is refunded)
    assert_eq(
        env.view_public(token0.balance_of_public(amm_address)),
        initial_amount0 + amount0_max,
    );
    assert_eq(
        env.view_public(token1.balance_of_public(amm_address)),
        initial_amount1 + 1000, // Only 1000 token1 used to maintain ratio
    );

    // Liquidity provider 2 should have 0 token0 and 200 token1 (refunded excess)
    assert_eq(env.simulate_utility(token0.balance_of_private(liquidity_provider_2)), 0);
    assert_eq(env.simulate_utility(token1.balance_of_private(liquidity_provider_2)), 200);

    // Check liquidity provider 2 received liquidity tokens proportional to their contribution
    // Expected: min((500 * 100000) / 1000, (1000 * 100000) / 2000) = 50000
    assert_eq(
        env.simulate_utility(liquidity_token.balance_of_private(liquidity_provider_2)),
        50000,
    );

    // Now remove half the liquidity from liquidity provider 1's position
    let liquidity_to_remove = 49500 as u128; // Half of 99000
    let amount0_min = 400 as u128;
    let amount1_min = 800 as u128;
    let authwit_nonce = 3;

    // Create authwit for transferring liquidity tokens to AMM
    let transfer_liquidity_call_interface = liquidity_token.transfer_to_public(
        liquidity_provider_1,
        amm_address,
        liquidity_to_remove,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider_1,
        amm_address,
        transfer_liquidity_call_interface,
    );

    env.call_private(
        liquidity_provider_1,
        amm.remove_liquidity(liquidity_to_remove, amount0_min, amount1_min, authwit_nonce),
    );

    // Verify liquidity provider 1 got tokens back (proportional to liquidity burned)
    // 49500/100000 of 1000 = 495, 49500/100000 of 2000 = 990
    assert_eq(env.simulate_utility(token0.balance_of_private(liquidity_provider_1)), 495);
    assert_eq(env.simulate_utility(token1.balance_of_private(liquidity_provider_1)), 990);

    // Check remaining liquidity tokens
    assert_eq(
        env.simulate_utility(liquidity_token.balance_of_private(liquidity_provider_1)),
        49500,
    ); // Other half
}

#[test]
unconstrained fn swap_exact_tokens_for_tokens_happy_path() {
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

    env.call_private(minter, token0.mint_to_private(liquidity_provider, liquidity_amount0));
    env.call_private(minter, token1.mint_to_private(liquidity_provider, liquidity_amount1));

    let transfer0_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        liquidity_amount0,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer0_call_interface,
    );

    let transfer1_call_interface = token1.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        liquidity_amount1,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer1_call_interface,
    );

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(liquidity_amount0, liquidity_amount1, 0, 0, 1),
    );

    // Now perform a swap
    let amount_in = 1000 as u128;
    let amount_out_min = 1800 as u128; // Expect ~1814 with 0.3% fee
    let authwit_nonce = 2;

    env.call_private(minter, token0.mint_to_private(swapper, amount_in));

    // Create authwit for transferring tokens to AMM
    let transfer_call_interface =
        token0.transfer_to_public(swapper, amm_address, amount_in, authwit_nonce);
    add_private_authwit_from_call_interface(swapper, amm_address, transfer_call_interface);

    env.call_private(
        swapper,
        amm.swap_exact_tokens_for_tokens(
            token0_address,
            token1_address,
            amount_in,
            amount_out_min,
            authwit_nonce,
        ),
    );

    // Verify swap occurred
    assert_eq(env.simulate_utility(token0.balance_of_private(swapper)), 0);
    // The exact amount out depends on the AMM formula, but should be > amount_out_min
    let swapper_token1_balance = env.simulate_utility(token1.balance_of_private(swapper));
    assert(swapper_token1_balance >= amount_out_min);
}

#[test]
unconstrained fn swap_tokens_for_exact_tokens_happy_path() {
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

    env.call_private(minter, token0.mint_to_private(liquidity_provider, liquidity_amount0));
    env.call_private(minter, token1.mint_to_private(liquidity_provider, liquidity_amount1));

    let transfer0_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        liquidity_amount0,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer0_call_interface,
    );

    let transfer1_call_interface = token1.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        liquidity_amount1,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer1_call_interface,
    );

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(liquidity_amount0, liquidity_amount1, 0, 0, 1),
    );

    // Now perform a swap for exact tokens out
    let amount_out = 1000 as u128;
    let amount_in_max = 600 as u128; // Should need ~503 tokens in with 0.3% fee
    let authwit_nonce = 2;

    env.call_private(minter, token0.mint_to_private(swapper, amount_in_max));

    // Create authwit for transferring tokens to AMM
    let transfer_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        swapper,
        amm_address,
        amount_in_max,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(swapper, amm_address, transfer_call_interface);

    env.call_private(
        swapper,
        amm.swap_tokens_for_exact_tokens(
            token0_address,
            token1_address,
            amount_out,
            amount_in_max,
            authwit_nonce,
        ),
    );

    // Verify swap occurred - should get exact amount out
    assert_eq(env.simulate_utility(token1.balance_of_private(swapper)), amount_out);
    // Should have some token0 change returned
    let swapper_token0_balance = env.simulate_utility(token0.balance_of_private(swapper));
    assert(swapper_token0_balance > 0);
    assert(swapper_token0_balance < amount_in_max);
}

// Unhappy path tests for add_liquidity

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
    let authwit_nonce = 1;

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, authwit_nonce),
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
    let authwit_nonce = 1;

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, authwit_nonce),
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
    let authwit_nonce = 1;

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, authwit_nonce),
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
    let authwit_nonce = 1;

    env.call_private(
        liquidity_provider,
        amm.add_liquidity(amount0_max, amount1_max, amount0_min, amount1_min, authwit_nonce),
    );
}

// Unhappy path tests for swap_exact_tokens_for_tokens

#[test(should_fail_with = "TOKEN_IN_IS_INVALID")]
unconstrained fn swap_exact_tokens_invalid_token_in() {
    let (mut env, amm_address, _token0_address, token1_address, _liquidity_token_address, _minter)
         = setup();

    let swapper = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let invalid_token = AztecAddress::from_field(999);
    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;
    let authwit_nonce = 1;

    env.call_private(
        swapper,
        amm.swap_exact_tokens_for_tokens(
            invalid_token,
            token1_address,
            amount_in,
            amount_out_min,
            authwit_nonce,
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
    let authwit_nonce = 1;

    env.call_private(
        swapper,
        amm.swap_exact_tokens_for_tokens(
            token0_address,
            invalid_token,
            amount_in,
            amount_out_min,
            authwit_nonce,
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
    let authwit_nonce = 1;

    env.call_private(
        swapper,
        amm.swap_exact_tokens_for_tokens(
            token0_address,
            token0_address, // Same token for in and out
            amount_in,
            amount_out_min,
            authwit_nonce,
        ),
    );
}

// Unhappy path tests for swap_tokens_for_exact_tokens

#[test(should_fail_with = "TOKEN_IN_IS_INVALID")]
unconstrained fn swap_tokens_for_exact_invalid_token_in() {
    let (mut env, amm_address, _token0_address, token1_address, _liquidity_token_address, _minter)
         = setup();

    let swapper = env.create_contract_account();
    let amm = AMM::at(amm_address);

    let invalid_token = AztecAddress::from_field(999);
    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;
    let authwit_nonce = 1;

    env.call_private(
        swapper,
        amm.swap_tokens_for_exact_tokens(
            invalid_token,
            token1_address,
            amount_out,
            amount_in_max,
            authwit_nonce,
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
    let authwit_nonce = 1;

    env.call_private(
        swapper,
        amm.swap_tokens_for_exact_tokens(
            token0_address,
            invalid_token,
            amount_out,
            amount_in_max,
            authwit_nonce,
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
    let authwit_nonce = 1;

    env.call_private(
        swapper,
        amm.swap_tokens_for_exact_tokens(
            token0_address,
            token0_address, // Same token for in and out
            amount_out,
            amount_in_max,
            authwit_nonce,
        ),
    );
}

// Edge case tests

#[test(should_fail_with = "INSUFFICIENT_LIQUIDITY_MINTED")]
unconstrained fn add_liquidity_insufficient_liquidity_minted() {
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, minter) =
        setup();

    let liquidity_provider_1 = env.create_contract_account();
    let liquidity_provider_2 = env.create_contract_account();

    let token0 = Token::at(token0_address);
    let token1 = Token::at(token1_address);
    let amm = AMM::at(amm_address);

    // Add initial liquidity first
    let initial_amount0 = 100000000 as u128; // Very large amount
    let initial_amount1 = 200000000 as u128;

    env.call_private(minter, token0.mint_to_private(liquidity_provider_1, initial_amount0));
    env.call_private(minter, token1.mint_to_private(liquidity_provider_1, initial_amount1));

    let transfer0_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider_1,
        amm_address,
        initial_amount0,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider_1,
        amm_address,
        transfer0_call_interface,
    );

    let transfer1_call_interface = token1.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider_1,
        amm_address,
        initial_amount1,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider_1,
        amm_address,
        transfer1_call_interface,
    );

    env.call_private(
        liquidity_provider_1,
        amm.add_liquidity(initial_amount0, initial_amount1, 0, 0, 1),
    );

    // Now try to add very small liquidity that would result in 0 liquidity tokens
    let tiny_amount0 = 1 as u128; // Very small amount
    let tiny_amount1 = 2 as u128;

    env.call_private(minter, token0.mint_to_private(liquidity_provider_2, tiny_amount0));
    env.call_private(minter, token1.mint_to_private(liquidity_provider_2, tiny_amount1));

    let transfer0_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider_2,
        amm_address,
        tiny_amount0,
        2,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider_2,
        amm_address,
        transfer0_call_interface,
    );

    let transfer1_call_interface = token1.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider_2,
        amm_address,
        tiny_amount1,
        2,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider_2,
        amm_address,
        transfer1_call_interface,
    );

    // This should fail because the liquidity minted would be 0
    env.call_private(liquidity_provider_2, amm.add_liquidity(tiny_amount0, tiny_amount1, 0, 0, 2));
}

#[test(should_fail_with = "INSUFFICIENT_0_AMOUNT")]
unconstrained fn remove_liquidity_insufficient_amount0() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, minter) =
        setup();

    let liquidity_provider = env.create_contract_account();

    let token0 = Token::at(token0_address);
    let token1 = Token::at(token1_address);
    let liquidity_token = Token::at(liquidity_token_address);
    let amm = AMM::at(amm_address);

    // Add liquidity first
    let amount0 = 1000 as u128;
    let amount1 = 2000 as u128;

    env.call_private(minter, token0.mint_to_private(liquidity_provider, amount0));
    env.call_private(minter, token1.mint_to_private(liquidity_provider, amount1));

    let transfer0_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        amount0,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer0_call_interface,
    );

    let transfer1_call_interface = token1.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        amount1,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer1_call_interface,
    );

    env.call_private(liquidity_provider, amm.add_liquidity(amount0, amount1, 0, 0, 1));

    // Try to remove liquidity with unrealistic minimum expectations
    let liquidity_to_remove = 49500 as u128; // Half of 99000
    let amount0_min = 10000 as u128; // Unrealistically high minimum
    let amount1_min = 800 as u128;
    let authwit_nonce = 2;

    let transfer_liquidity_call_interface = liquidity_token.transfer_to_public(
        liquidity_provider,
        amm_address,
        liquidity_to_remove,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer_liquidity_call_interface,
    );

    env.call_private(
        liquidity_provider,
        amm.remove_liquidity(liquidity_to_remove, amount0_min, amount1_min, authwit_nonce),
    );
}

#[test(should_fail_with = "INSUFFICIENT_1_AMOUNT")]
unconstrained fn remove_liquidity_insufficient_amount1() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, minter) =
        setup();

    let liquidity_provider = env.create_contract_account();

    let token0 = Token::at(token0_address);
    let token1 = Token::at(token1_address);
    let liquidity_token = Token::at(liquidity_token_address);
    let amm = AMM::at(amm_address);

    // Add liquidity first
    let amount0 = 1000 as u128;
    let amount1 = 2000 as u128;

    env.call_private(minter, token0.mint_to_private(liquidity_provider, amount0));
    env.call_private(minter, token1.mint_to_private(liquidity_provider, amount1));

    let transfer0_call_interface = token0.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        amount0,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer0_call_interface,
    );

    let transfer1_call_interface = token1.transfer_to_public_and_prepare_private_balance_increase(
        liquidity_provider,
        amm_address,
        amount1,
        1,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer1_call_interface,
    );

    env.call_private(liquidity_provider, amm.add_liquidity(amount0, amount1, 0, 0, 1));

    // Try to remove liquidity with unrealistic minimum expectations
    let liquidity_to_remove = 49500 as u128; // Half of 99000
    let amount0_min = 400 as u128;
    let amount1_min = 20000 as u128; // Unrealistically high minimum
    let authwit_nonce = 2;

    let transfer_liquidity_call_interface = liquidity_token.transfer_to_public(
        liquidity_provider,
        amm_address,
        liquidity_to_remove,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_address,
        transfer_liquidity_call_interface,
    );

    env.call_private(
        liquidity_provider,
        amm.remove_liquidity(liquidity_to_remove, amount0_min, amount1_min, authwit_nonce),
    );
}
