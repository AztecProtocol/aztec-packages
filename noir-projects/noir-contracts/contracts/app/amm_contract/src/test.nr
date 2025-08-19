use crate::AMM;

use aztec::{
    protocol_types::{address::AztecAddress, traits::FromField},
    test::helpers::{
        authwit::add_private_authwit_from_call_interface, test_environment::TestEnvironment,
    },
};
use token::Token;

// Utility function to setup three token contracts (token0, token1, liquidity_token)
unconstrained fn setup_tokens(
    env: &mut TestEnvironment,
    owner: AztecAddress,
) -> (AztecAddress, AztecAddress, AztecAddress) {
    // Deploy first token contract (token0)
    let token0_initializer = Token::interface().constructor(
        owner,
        "Token00000000000000000000000000",
        "TK00000000000000000000000000000",
        18,
    );
    let token0_address =
        env.deploy("@token_contract/Token").with_public_initializer(owner, token0_initializer);

    // Deploy second token contract (token1)
    let token1_initializer = Token::interface().constructor(
        owner,
        "Token11111111111111111111111111",
        "TK11111111111111111111111111111",
        18,
    );
    let token1_address =
        env.deploy("@token_contract/Token").with_public_initializer(owner, token1_initializer);

    // Deploy liquidity token contract
    let liquidity_token_initializer = Token::interface().constructor(
        owner,
        "LiquidityToken00000000000000000",
        "LT00000000000000000000000000000",
        18,
    );
    let liquidity_token_address = env.deploy("@token_contract/Token").with_public_initializer(
        owner,
        liquidity_token_initializer,
    );

    (token0_address, token1_address, liquidity_token_address)
}

// Utility function to setup AMM with three tokens
unconstrained fn setup_amm_with_tokens(
    with_account_contracts: bool,
    ) -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = if with_account_contracts {
        env.create_contract_account()
    } else {
        env.create_light_account()
    };

    let (token0_address, token1_address, liquidity_token_address) = setup_tokens(&mut env, owner);

    // Deploy AMM contract
    let amm_initializer =
        AMM::interface().constructor(token0_address, token1_address, liquidity_token_address);
    let amm_address = env.deploy("AMM").with_public_initializer(owner, amm_initializer);

    // Set AMM as minter for liquidity token
    env.call_public(owner, Token::at(liquidity_token_address).set_minter(amm_address, true));

    (env, amm_address, token0_address, token1_address, liquidity_token_address, owner, owner)
}

// Utility function to mint tokens to private balance
unconstrained fn mint_to_private(
    env: TestEnvironment,
    token_address: AztecAddress,
    owner: AztecAddress,
    to: AztecAddress,
    amount: u128,
) {
    env.call_private(owner, Token::at(token_address).mint_to_private(to, amount));
}

// Utility function to check private balance
unconstrained fn check_private_balance(
    env: TestEnvironment,
    token_address: AztecAddress,
    address: AztecAddress,
    expected_amount: u128,
) {
    assert_eq(
        env.simulate_utility(Token::at(token_address).balance_of_private(address)),
        expected_amount,
    );
}

// Utility function to check public balance
unconstrained fn check_public_balance(
    env: TestEnvironment,
    token_address: AztecAddress,
    address: AztecAddress,
    expected_amount: u128,
) {
    assert_eq(
        env.view_public(Token::at(token_address).balance_of_public(address)),
        expected_amount,
    );
}

// Happy path tests

#[test]
unconstrained fn add_initial_liquidity_happy_path() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, owner, _) =
        setup_amm_with_tokens(true);

    let amount0_max = 1000 as u128;
    let amount1_max = 2000 as u128;
    let amount0_min = 500 as u128;
    let amount1_min = 1000 as u128;
    let authwit_nonce = 1;

    // Mint tokens to owner
    mint_to_private(env, token0_address, owner, owner, amount0_max);
    mint_to_private(env, token1_address, owner, owner, amount1_max);

    // Create authwits for transferring tokens to AMM
    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            amount0_max,
            authwit_nonce,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            amount1_max,
            authwit_nonce,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    // Add liquidity
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

    // Verify tokens were transferred to AMM's public balance
    check_public_balance(env, token0_address, amm_address, amount0_max);
    check_public_balance(env, token1_address, amm_address, amount1_max);
    check_private_balance(env, token0_address, owner, 0);
    check_private_balance(env, token1_address, owner, 0);

    // Check liquidity tokens were minted (initial liquidity = 99000)
    check_private_balance(env, liquidity_token_address, owner, 99000);

    // Check total supply includes locked liquidity (99000 + 1000 = 100000)
    let total_supply = env.view_public(Token::at(liquidity_token_address).total_supply());
    assert_eq(total_supply, 100000);
}

#[test]
unconstrained fn add_liquidity_subsequent_happy_path() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, owner, _) =
        setup_amm_with_tokens(true);

    let user2 = env.create_contract_account();

    // First add initial liquidity
    let initial_amount0 = 1000 as u128;
    let initial_amount1 = 2000 as u128;

    mint_to_private(env, token0_address, owner, owner, initial_amount0);
    mint_to_private(env, token1_address, owner, owner, initial_amount1);

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            initial_amount0,
            1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            initial_amount1,
            1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(initial_amount0, initial_amount1, 0, 0, 1),
    );

    // Now add liquidity from user2 with proper ratio
    let amount0_max = 500 as u128;
    let amount1_max = 1000 as u128; // Maintains 1:2 ratio
    let amount0_min = 400 as u128;
    let amount1_min = 800 as u128;
    let authwit_nonce = 2;

    mint_to_private(env, token0_address, owner, user2, amount0_max);
    mint_to_private(env, token1_address, owner, user2, amount1_max);

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            user2,
            amm_address,
            amount0_max,
            authwit_nonce,
        );
    add_private_authwit_from_call_interface(user2, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            user2,
            amm_address,
            amount1_max,
            authwit_nonce,
        );
    add_private_authwit_from_call_interface(user2, amm_address, transfer1_call_interface);

    env.call_private(
        user2,
        AMM::at(amm_address).add_liquidity(
            amount0_max,
            amount1_max,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );

    // Verify balances
    check_public_balance(
        env,
        token0_address,
        amm_address,
        initial_amount0 + amount0_max,
    );
    check_public_balance(
        env,
        token1_address,
        amm_address,
        initial_amount1 + amount1_max,
    );
    check_private_balance(env, token0_address, user2, 0);
    check_private_balance(env, token1_address, user2, 0);

    // Check user2 received liquidity tokens proportional to their contribution
    // Expected: min((500 * 100000) / 1000, (1000 * 100000) / 2000) = 50000
    check_private_balance(env, liquidity_token_address, user2, 50000);
}

#[test]
unconstrained fn remove_liquidity_happy_path() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, owner, _) =
        setup_amm_with_tokens(true);

    // First add liquidity
    let amount0 = 1000 as u128;
    let amount1 = 2000 as u128;

    mint_to_private(env, token0_address, owner, owner, amount0);
    mint_to_private(env, token1_address, owner, owner, amount1);

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(owner, amm_address, amount0, 1);
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(owner, amm_address, amount1, 1);
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(owner, AMM::at(amm_address).add_liquidity(amount0, amount1, 0, 0, 1));

    // Now remove half the liquidity
    let liquidity_to_remove = 49500 as u128; // Half of 99000
    let amount0_min = 400 as u128;
    let amount1_min = 800 as u128;
    let authwit_nonce = 2;

    // Create authwit for transferring liquidity tokens to AMM
    let transfer_liquidity_call_interface = Token::at(liquidity_token_address).transfer_to_public(
        owner,
        amm_address,
        liquidity_to_remove,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(owner, amm_address, transfer_liquidity_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).remove_liquidity(
            liquidity_to_remove,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );

    // Verify owner got tokens back (proportional to liquidity burned)
    // 49500/100000 of 1000 = 495, 49500/100000 of 2000 = 990
    check_private_balance(env, token0_address, owner, 495);
    check_private_balance(env, token1_address, owner, 990);

    // Check remaining liquidity tokens
    check_private_balance(env, liquidity_token_address, owner, 49500); // Other half
}

#[test]
unconstrained fn swap_exact_tokens_for_tokens_happy_path() {
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(true);

    let swapper = env.create_contract_account();

    // First add liquidity to the pool
    let liquidity_amount0 = 10000 as u128;
    let liquidity_amount1 = 20000 as u128;

    mint_to_private(env, token0_address, owner, owner, liquidity_amount0);
    mint_to_private(env, token1_address, owner, owner, liquidity_amount1);

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            liquidity_amount0,
            1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            liquidity_amount1,
            1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(liquidity_amount0, liquidity_amount1, 0, 0, 1),
    );

    // Now perform a swap
    let amount_in = 1000 as u128;
    let amount_out_min = 1800 as u128; // Expect ~1814 with 0.3% fee
    let authwit_nonce = 2;

    mint_to_private(env, token0_address, owner, swapper, amount_in);

    // Create authwit for transferring tokens to AMM
    let transfer_call_interface = Token::at(token0_address).transfer_to_public(
        swapper,
        amm_address,
        amount_in,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(swapper, amm_address, transfer_call_interface);

    env.call_private(
        swapper,
        AMM::at(amm_address).swap_exact_tokens_for_tokens(
            token0_address,
            token1_address,
            amount_in,
            amount_out_min,
            authwit_nonce,
        ),
    );

    // Verify swap occurred
    check_private_balance(env, token0_address, swapper, 0);
    // The exact amount out depends on the AMM formula, but should be > amount_out_min
    let swapper_token1_balance =
        env.simulate_utility(Token::at(token1_address).balance_of_private(swapper));
    assert(swapper_token1_balance >= amount_out_min);
}

#[test]
unconstrained fn swap_tokens_for_exact_tokens_happy_path() {
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(true);

    let swapper = env.create_contract_account();

    // First add liquidity to the pool
    let liquidity_amount0 = 10000 as u128;
    let liquidity_amount1 = 20000 as u128;

    mint_to_private(env, token0_address, owner, owner, liquidity_amount0);
    mint_to_private(env, token1_address, owner, owner, liquidity_amount1);

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            liquidity_amount0,
            1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            liquidity_amount1,
            1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(liquidity_amount0, liquidity_amount1, 0, 0, 1),
    );

    // Now perform a swap for exact tokens out
    let amount_out = 1000 as u128;
    let amount_in_max = 600 as u128; // Should need ~503 tokens in with 0.3% fee
    let authwit_nonce = 2;

    mint_to_private(env, token0_address, owner, swapper, amount_in_max);

    // Create authwit for transferring tokens to AMM
    let transfer_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            swapper,
            amm_address,
            amount_in_max,
            authwit_nonce,
        );
    add_private_authwit_from_call_interface(swapper, amm_address, transfer_call_interface);

    env.call_private(
        swapper,
        AMM::at(amm_address).swap_tokens_for_exact_tokens(
            token0_address,
            token1_address,
            amount_out,
            amount_in_max,
            authwit_nonce,
        ),
    );

    // Verify swap occurred - should get exact amount out
    check_private_balance(env, token1_address, swapper, amount_out);

    // Should have some token0 change returned
    let swapper_token0_balance =
        env.simulate_utility(Token::at(token0_address).balance_of_private(swapper));
    assert(swapper_token0_balance > 0);
    assert(swapper_token0_balance < amount_in_max);
}

// Unhappy path tests for add_liquidity

#[test(should_fail_with = "INCORRECT_TOKEN0_LIMITS")]
unconstrained fn add_liquidity_incorrect_token0_limits() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

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
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

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
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

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
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

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
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

    let invalid_token = AztecAddress::from_field(999);
    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_exact_tokens_for_tokens(
            invalid_token,
            _token1_address,
            amount_in,
            amount_out_min,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "TOKEN_OUT_IS_INVALID")]
unconstrained fn swap_exact_tokens_invalid_token_out() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

    let invalid_token = AztecAddress::from_field(999);
    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_exact_tokens_for_tokens(
            _token0_address,
            invalid_token,
            amount_in,
            amount_out_min,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "SAME_TOKEN_SWAP")]
unconstrained fn swap_exact_tokens_same_tokens() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

    let amount_in = 1000 as u128;
    let amount_out_min = 900 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_exact_tokens_for_tokens(
            _token0_address,
            _token0_address, // Same token for in and out
            amount_in,
            amount_out_min,
            authwit_nonce,
        ),
    );
}

// Unhappy path tests for swap_tokens_for_exact_tokens

#[test(should_fail_with = "TOKEN_IN_IS_INVALID")]
unconstrained fn swap_tokens_for_exact_invalid_token_in() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

    let invalid_token = AztecAddress::from_field(999);
    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_tokens_for_exact_tokens(
            invalid_token,
            _token1_address,
            amount_out,
            amount_in_max,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "TOKEN_OUT_IS_INVALID")]
unconstrained fn swap_tokens_for_exact_invalid_token_out() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

    let invalid_token = AztecAddress::from_field(999);
    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_tokens_for_exact_tokens(
            _token0_address,
            invalid_token,
            amount_out,
            amount_in_max,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "SAME_TOKEN_SWAP")]
unconstrained fn swap_tokens_for_exact_same_tokens() {
    let (mut env, amm_address, _token0_address, _token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(false);

    let amount_out = 1000 as u128;
    let amount_in_max = 1200 as u128;
    let authwit_nonce = 1;

    env.call_private(
        owner,
        AMM::at(amm_address).swap_tokens_for_exact_tokens(
            _token0_address,
            _token0_address, // Same token for in and out
            amount_out,
            amount_in_max,
            authwit_nonce,
        ),
    );
}

// Edge case tests

#[test(should_fail_with = "INSUFFICIENT_LIQUIDITY_MINTED")]
unconstrained fn add_liquidity_insufficient_liquidity_minted() {
    let (mut env, amm_address, token0_address, token1_address, _liquidity_token_address, owner, _)
         = setup_amm_with_tokens(true);

    // Add initial liquidity first
    let initial_amount0 = 100000000 as u128; // Very large amount
    let initial_amount1 = 200000000 as u128;

    mint_to_private(env, token0_address, owner, owner, initial_amount0);
    mint_to_private(env, token1_address, owner, owner, initial_amount1);

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            initial_amount0,
            1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            owner,
            amm_address,
            initial_amount1,
            1,
        );
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).add_liquidity(initial_amount0, initial_amount1, 0, 0, 1),
    );

    // Now try to add very small liquidity that would result in 0 liquidity tokens
    let user2 = env.create_contract_account();
    let tiny_amount0 = 1 as u128; // Very small amount
    let tiny_amount1 = 2 as u128;

    mint_to_private(env, token0_address, owner, user2, tiny_amount0);
    mint_to_private(env, token1_address, owner, user2, tiny_amount1);

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(user2, amm_address, tiny_amount0, 2
            );
add_private_authwit_from_call_interface(user2, amm_address, transfer0_call_interface);

let transfer1_call_interface = Token::at(token1_address)
    .transfer_to_public_and_prepare_private_balance_increase(user2, amm_address, tiny_amount1, 2);
add_private_authwit_from_call_interface(user2, amm_address, transfer1_call_interface);

// This should fail because the liquidity minted would be 0
env.call_private(user2, AMM::at(amm_address).add_liquidity(tiny_amount0, tiny_amount1, 0, 0, 2));
}

#[test(should_fail_with = "INSUFFICIENT_0_AMOUNT")]
unconstrained fn remove_liquidity_insufficient_amount0() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, owner, _) =
        setup_amm_with_tokens(true);

    // Add liquidity first
    let amount0 = 1000 as u128;
    let amount1 = 2000 as u128;

    mint_to_private(env, token0_address, owner, owner, amount0);
    mint_to_private(env, token1_address, owner, owner, amount1);

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(owner, amm_address, amount0, 1);
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(owner, amm_address, amount1, 1);
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(owner, AMM::at(amm_address).add_liquidity(amount0, amount1, 0, 0, 1));

    // Try to remove liquidity with unrealistic minimum expectations
    let liquidity_to_remove = 49500 as u128; // Half of 99000
    let amount0_min = 10000 as u128; // Unrealistically high minimum
    let amount1_min = 800 as u128;
    let authwit_nonce = 2;

    let transfer_liquidity_call_interface = Token::at(liquidity_token_address).transfer_to_public(
        owner,
        amm_address,
        liquidity_to_remove,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(owner, amm_address, transfer_liquidity_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).remove_liquidity(
            liquidity_to_remove,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "INSUFFICIENT_1_AMOUNT")]
unconstrained fn remove_liquidity_insufficient_amount1() {
    let (mut env, amm_address, token0_address, token1_address, liquidity_token_address, owner, _) =
        setup_amm_with_tokens(true);

    // Add liquidity first
    let amount0 = 1000 as u128;
    let amount1 = 2000 as u128;

    mint_to_private(env, token0_address, owner, owner, amount0);
    mint_to_private(env, token1_address, owner, owner, amount1);

    let transfer0_call_interface = Token::at(token0_address)
        .transfer_to_public_and_prepare_private_balance_increase(owner, amm_address, amount0, 1);
    add_private_authwit_from_call_interface(owner, amm_address, transfer0_call_interface);

    let transfer1_call_interface = Token::at(token1_address)
        .transfer_to_public_and_prepare_private_balance_increase(owner, amm_address, amount1, 1);
    add_private_authwit_from_call_interface(owner, amm_address, transfer1_call_interface);

    env.call_private(owner, AMM::at(amm_address).add_liquidity(amount0, amount1, 0, 0, 1));

    // Try to remove liquidity with unrealistic minimum expectations
    let liquidity_to_remove = 49500 as u128; // Half of 99000
    let amount0_min = 400 as u128;
    let amount1_min = 20000 as u128; // Unrealistically high minimum
    let authwit_nonce = 2;

    let transfer_liquidity_call_interface = Token::at(liquidity_token_address).transfer_to_public(
        owner,
        amm_address,
        liquidity_to_remove,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(owner, amm_address, transfer_liquidity_call_interface);

    env.call_private(
        owner,
        AMM::at(amm_address).remove_liquidity(
            liquidity_to_remove,
            amount0_min,
            amount1_min,
            authwit_nonce,
        ),
    );
}
