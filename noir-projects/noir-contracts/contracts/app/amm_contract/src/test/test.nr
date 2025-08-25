use crate::{AMM, test::utils::setup};
use aztec::{
    protocol_types::{address::AztecAddress, traits::FromField},
    test::helpers::authwit::add_private_authwit_from_call_interface,
};
use token::Token;

// Global constants for shared values in tests
global INITIAL_LIQUIDITY_AMOUNT0: u128 = 1000;
global INITIAL_LIQUIDITY_AMOUNT1: u128 = 2000;
global SWAP_AMOUNT_IN: u128 = 1000;
global SWAP_AMOUNT_OUT_MIN: u128 = 1800;
global SWAP_AMOUNT_OUT: u128 = 1000;
global SWAP_AMOUNT_IN_MAX: u128 = 600;
global ADD_LIQUIDITY_AMOUNT0_MAX: u128 = 500;
global ADD_LIQUIDITY_AMOUNT1_MAX: u128 = 1200;
global ADD_LIQUIDITY_AMOUNT0_MIN: u128 = 400;
global ADD_LIQUIDITY_AMOUNT1_MIN: u128 = 800;
global REMOVE_LIQUIDITY_AMOUNT: u128 = 49500;
global REMOVE_LIQUIDITY_AMOUNT0_MIN: u128 = 400;
global REMOVE_LIQUIDITY_AMOUNT1_MIN: u128 = 800;
global AUTHWIT_NONCE_1: Field = 1;
global AUTHWIT_NONCE_2: Field = 2;
global AUTHWIT_NONCE_3: Field = 3;

/// Add and remove liquidity from the AMM pool. We add liquidity twice to test the liquidity token ratios are as
/// expected even in the non-zero-initial-liquidity case.
#[test]
unconstrained fn add_liquidity_twice_and_remove_liquidity_happy_path() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, owner) =
        setup();

    let user2 = env.create_contract_account();

    // First add initial liquidity from owner
    env.call_private(
        owner,
        Token::at(token0_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT0),
    );
    env.call_private(
        owner,
        Token::at(token1_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT1),
    );

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT0,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT1,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(
            INITIAL_LIQUIDITY_AMOUNT0,
            INITIAL_LIQUIDITY_AMOUNT1,
            0,
            0,
            AUTHWIT_NONCE_1,
        ),
    );

    // Add liquidity from user2 with excess token1
    env.call_private(
        owner,
        Token::at(token0_address).mint_to_private(user2, ADD_LIQUIDITY_AMOUNT0_MAX),
    );
    env.call_private(
        owner,
        Token::at(token1_address).mint_to_private(user2, ADD_LIQUIDITY_AMOUNT1_MAX),
    );

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            user2,
            amm_address,
            ADD_LIQUIDITY_AMOUNT0_MAX,
            AUTHWIT_NONCE_2,
        );
    add_private_authwit_from_call_interface(user2, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            user2,
            amm_address,
            ADD_LIQUIDITY_AMOUNT1_MAX,
            AUTHWIT_NONCE_2,
        );
    add_private_authwit_from_call_interface(user2, amm_address, transfer1_call_interface);

    env.call_private(
        user2,
        AMM::at(amm_address).add_liquidity(
            ADD_LIQUIDITY_AMOUNT0_MAX,
            ADD_LIQUIDITY_AMOUNT1_MAX,
            ADD_LIQUIDITY_AMOUNT0_MIN,
            ADD_LIQUIDITY_AMOUNT1_MIN,
            AUTHWIT_NONCE_2,
        ),
    );

    // Verify balances after adding liquidity
    // AMM should have received 500 token0 and 1000 token1 (not 1200, as excess is refunded)
    assert_eq(
        env.view_public(Token::at(token0_address).balance_of_public(amm_address)),
        INITIAL_LIQUIDITY_AMOUNT0 + ADD_LIQUIDITY_AMOUNT0_MAX,
    );
    assert_eq(
        env.view_public(Token::at(token1_address).balance_of_public(amm_address)),
        INITIAL_LIQUIDITY_AMOUNT1 + 1000, // Only 1000 token1 used to maintain ratio
    );

    // User2 should have 0 token0 and 200 token1 (refunded excess)
    assert_eq(env.simulate_utility(Token::at(token0_address).balance_of_private(user2)), 0);
    assert_eq(env.simulate_utility(Token::at(token1_address).balance_of_private(user2)), 200);

    // Check user2 received liquidity tokens proportional to their contribution
    // Expected: min((500 * 100000) / 1000, (1000 * 100000) / 2000) = 50000
    assert_eq(
        env.simulate_utility(Token::at(liquidity_token_address).balance_of_private(user2)),
        50000,
    );

    // Now remove half the liquidity from owner's position
    // Create authwit for transferring liquidity tokens to AMM
    let transfer_liquidity_call_interface = Token::at(liquidity_token_address).transfer_to_public(
        owner,
        amm_address,
        REMOVE_LIQUIDITY_AMOUNT,
        AUTHWIT_NONCE_3,
    );
    add_private_authwit_from_call_interface(owner, amm_address, transfer_liquidity_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).remove_liquidity(
            REMOVE_LIQUIDITY_AMOUNT,
            REMOVE_LIQUIDITY_AMOUNT0_MIN,
            REMOVE_LIQUIDITY_AMOUNT1_MIN,
            AUTHWIT_NONCE_3,
        ),
    );

    // Verify owner got tokens back (proportional to liquidity burned)
    // 49500/100000 of 1000 = 495, 49500/100000 of 2000 = 990
    assert_eq(env.simulate_utility(Token::at(token0_address).balance_of_private(owner)), 495);
    assert_eq(env.simulate_utility(Token::at(token1_address).balance_of_private(owner)), 990);

    // Check remaining liquidity tokens
    assert_eq(
        env.simulate_utility(Token::at(liquidity_token_address).balance_of_private(owner)),
        49500,
    ); // Other half
}

#[test]
unconstrained fn swap_exact_tokens_for_tokens_happy_path() {
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, owner) =
        setup();

    let swapper = env.create_contract_account();

    // First add liquidity to the pool
    env.call_private(
        owner,
        Token::at(token0_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT0 * 10),
    );
    env.call_private(
        owner,
        Token::at(token1_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT1 * 10),
    );

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT0 * 10,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT1 * 10,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(
            INITIAL_LIQUIDITY_AMOUNT0 * 10,
            INITIAL_LIQUIDITY_AMOUNT1 * 10,
            0,
            0,
            AUTHWIT_NONCE_1,
        ),
    );

    // Now perform a swap
    env.call_private(owner, Token::at(token0_address).mint_to_private(swapper, SWAP_AMOUNT_IN));

    // Create authwit for transferring tokens to AMM
    let transfer_call_interface = Token::at(token0_address).transfer_to_public(
        swapper,
        amm_address,
        SWAP_AMOUNT_IN,
        AUTHWIT_NONCE_2,
    );
    add_private_authwit_from_call_interface(swapper, amm_address, transfer_call_interface);

    env.call_private(
        swapper,
        AMM::at(amm_address).swap_exact_tokens_for_tokens(
            token0_address,
            token1_address,
            SWAP_AMOUNT_IN,
            SWAP_AMOUNT_OUT_MIN,
            AUTHWIT_NONCE_2,
        ),
    );

    // Verify swap occurred
    assert_eq(env.simulate_utility(Token::at(token0_address).balance_of_private(swapper)), 0);
    // The exact amount out depends on the AMM formula, but should be > amount_out_min
    let swapper_token1_balance =
        env.simulate_utility(Token::at(token1_address).balance_of_private(swapper));
    assert(swapper_token1_balance >= SWAP_AMOUNT_OUT_MIN);
}

#[test]
unconstrained fn swap_tokens_for_exact_tokens_happy_path() {
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, owner) =
        setup();

    let swapper = env.create_contract_account();

    // First add liquidity to the pool
    env.call_private(
        owner,
        Token::at(token0_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT0 * 10),
    );
    env.call_private(
        owner,
        Token::at(token1_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT1 * 10),
    );

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT0 * 10,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT1 * 10,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(
            INITIAL_LIQUIDITY_AMOUNT0 * 10,
            INITIAL_LIQUIDITY_AMOUNT1 * 10,
            0,
            0,
            AUTHWIT_NONCE_1,
        ),
    );

    // Now perform a swap for exact tokens out
    env.call_private(owner, Token::at(token0_address).mint_to_private(swapper, SWAP_AMOUNT_IN_MAX));

    // Create authwit for transferring tokens to AMM
    let transfer_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            swapper,
            amm_address,
            SWAP_AMOUNT_IN_MAX,
            AUTHWIT_NONCE_2,
        );
    add_private_authwit_from_call_interface(swapper, amm_address, transfer_call_interface);

    env.call_private(
        swapper,
        AMM::at(amm_address).swap_tokens_for_exact_tokens(
            token0_address,
            token1_address,
            SWAP_AMOUNT_OUT,
            SWAP_AMOUNT_IN_MAX,
            AUTHWIT_NONCE_2,
        ),
    );

    // Verify swap occurred - should get exact amount out
    assert_eq(
        env.simulate_utility(Token::at(token1_address).balance_of_private(swapper)),
        SWAP_AMOUNT_OUT,
    );

    // Should have some token0 change returned
    let swapper_token0_balance =
        env.simulate_utility(Token::at(token0_address).balance_of_private(swapper));
    assert(swapper_token0_balance > 0);
    assert(swapper_token0_balance < SWAP_AMOUNT_IN_MAX);
}

// Unhappy path tests for add_liquidity

#[test(should_fail_with = "INCORRECT_TOKEN0_LIMITS")]
unconstrained fn add_liquidity_incorrect_token0_limits() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner) =
        setup();

    // amount0_min > amount0_max should fail
    let amount0_max = 500 as u128;
    let amount1_max = 1000 as u128;
    let amount0_min = 600 as u128; // Invalid: min > max
    let amount1_min = 500 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(
            amount0_max,
            amount1_max,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "INCORRECT_TOKEN1_LIMITS")]
unconstrained fn add_liquidity_incorrect_token1_limits() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner) =
        setup();

    // amount1_min > amount1_max should fail
    let amount0_max = 500 as u128;
    let amount1_max = 1000 as u128;
    let amount0_min = 400 as u128;
    let amount1_min = 1100 as u128; // Invalid: min > max
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(
            amount0_max,
            amount1_max,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "INSUFFICIENT_INPUT_AMOUNTS")]
unconstrained fn add_liquidity_zero_amount0_max() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner) =
        setup();

    let amount0_max = 0 as u128; // Invalid: zero amount
    let amount1_max = 1000 as u128;
    let amount0_min = 0 as u128;
    let amount1_min = 500 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(
            amount0_max,
            amount1_max,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "INSUFFICIENT_INPUT_AMOUNTS")]
unconstrained fn add_liquidity_zero_amount1_max() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner) =
        setup();

    let amount0_max = 1000 as u128;
    let amount1_max = 0 as u128; // Invalid: zero amount
    let amount0_min = 500 as u128;
    let amount1_min = 0 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(
            amount0_max,
            amount1_max,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );
}

// Unhappy path tests for swap_exact_tokens_for_tokens

#[test(should_fail_with = "TOKEN_IN_IS_INVALID")]
unconstrained fn swap_exact_tokens_invalid_token_in() {
    let (mut env, amm_address, _token0_address, token1_address, _liquidity_token_address, owner) =
        setup();

    let invalid_token = AztecAddress::from_field(999);
    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_exact_tokens_for_tokens(
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
    let (mut env, amm_address, token0_address, _token1_address, _liquidity_token_address, owner) =
        setup();

    let invalid_token = AztecAddress::from_field(999);
    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_exact_tokens_for_tokens(
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
    let (mut env, amm_address, token0_address, _token1_address, _liquidity_token_address, owner) =
        setup();

    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_exact_tokens_for_tokens(
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
    let (mut env, amm_address, _token0_address, token1_address, _liquidity_token_address, owner) =
        setup();

    let invalid_token = AztecAddress::from_field(999);
    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_tokens_for_exact_tokens(
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
    let (mut env, amm_address, token0_address, _token1_address, _liquidity_token_address, owner) =
        setup();

    let invalid_token = AztecAddress::from_field(999);
    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_tokens_for_exact_tokens(
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
    let (mut env, amm_address, token0_address, _token1_address, _liquidity_token_address, owner) =
        setup();

    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_tokens_for_exact_tokens(
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
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, owner) =
        setup();

    // Add initial liquidity first
    let initial_amount0 = 100000000 as u128; // Very large amount
    let initial_amount1 = 200000000 as u128;

    env.call_private(owner, Token::at(token0_address).mint_to_private(owner, initial_amount0));
    env.call_private(owner, Token::at(token1_address).mint_to_private(owner, initial_amount1));

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            initial_amount0,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            initial_amount1,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(initial_amount0, initial_amount1, 0, 0, AUTHWIT_NONCE_1),
    );

    // Now try to add very small liquidity that would result in 0 liquidity tokens
    let user2 = env.create_contract_account();
    let tiny_amount0 = 1 as u128; // Very small amount
    let tiny_amount1 = 2 as u128;

    env.call_private(owner, Token::at(token0_address).mint_to_private(user2, tiny_amount0));
    env.call_private(owner, Token::at(token1_address).mint_to_private(user2, tiny_amount1));

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            user2,
            amm_address,
            tiny_amount0,
            AUTHWIT_NONCE_2,
        );
    add_private_authwit_from_call_interface(user2, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            user2,
            amm_address,
            tiny_amount1,
            AUTHWIT_NONCE_2,
        );
    add_private_authwit_from_call_interface(user2, amm_address, transfer1_call_interface);

    // This should fail because the liquidity minted would be 0
    env.call_private(
        user2,
        AMM::at(amm_address).add_liquidity(tiny_amount0, tiny_amount1, 0, 0, AUTHWIT_NONCE_2),
    );
}

#[test(should_fail_with = "INSUFFICIENT_0_AMOUNT")]
unconstrained fn remove_liquidity_insufficient_amount0() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, owner) =
        setup();

    // Add liquidity first
    env.call_private(
        owner,
        Token::at(token0_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT0),
    );
    env.call_private(
        owner,
        Token::at(token1_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT1),
    );

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT0,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT1,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(
            INITIAL_LIQUIDITY_AMOUNT0,
            INITIAL_LIQUIDITY_AMOUNT1,
            0,
            0,
            AUTHWIT_NONCE_1,
        ),
    );

    // Try to remove liquidity with unrealistic minimum expectations
    let amount0_min = 10000 as u128; // Unrealistically high minimum
    let amount1_min = 800 as u128;
    let authwit_nonce = 2;

    let transfer_liquidity_call_interface = Token::at(liquidity_token_address).transfer_to_public(
        owner,
        amm_address,
        REMOVE_LIQUIDITY_AMOUNT,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(owner, amm_address, transfer_liquidity_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).remove_liquidity(
            REMOVE_LIQUIDITY_AMOUNT,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "INSUFFICIENT_1_AMOUNT")]
unconstrained fn remove_liquidity_insufficient_amount1() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, owner) =
        setup();

    // Add liquidity first
    env.call_private(
        owner,
        Token::at(token0_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT0),
    );
    env.call_private(
        owner,
        Token::at(token1_address).mint_to_private(owner, INITIAL_LIQUIDITY_AMOUNT1),
    );

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT0,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            INITIAL_LIQUIDITY_AMOUNT1,
            AUTHWIT_NONCE_1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(
            INITIAL_LIQUIDITY_AMOUNT0,
            INITIAL_LIQUIDITY_AMOUNT1,
            0,
            0,
            AUTHWIT_NONCE_1,
        ),
    );

    // Try to remove liquidity with unrealistic minimum expectations
    let amount0_min = 400 as u128;
    let amount1_min = 20000 as u128; // Unrealistically high minimum
    let authwit_nonce = 2;

    let transfer_liquidity_call_interface = Token::at(liquidity_token_address).transfer_to_public(
        owner,
        amm_address,
        REMOVE_LIQUIDITY_AMOUNT,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(owner, amm_address, transfer_liquidity_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).remove_liquidity(
            REMOVE_LIQUIDITY_AMOUNT,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );
}
