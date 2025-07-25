use crate::test::utils;
use crate::Token;
use aztec::{
    oracle::random::random, test::helpers::authwit::add_private_authwit_from_call_interface,
};

// Tests the typical scenario in which transfer_to_public_and_prepare_private_balance_increase is to be used:
// 1. The liquidity provider calls private AMM::add_liquidity function,
// 2. the AMM contract transfers the full amount to the public balance of the AMM,
// 3. public AMM::_add_liquidity function is called and based on that max acceptable amount of the token is computed,
// 4. full amount - max acceptable amount is transferred back to the liquidity provider's private balance as change.
//
// This is a typical scenario as we receive the change in the same token with which we are "depositing" to the public
// balance of the AMM.
#[test]
unconstrained fn transfer_to_public_and_prepare_private_balance_increase_and_finalize_transfer_to_private() {
    let (env, token_contract_address, liquidity_provider, amm_contract, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);

    let deposit_amount: u128 = mint_amount / (10 as u128);
    let transfer_call_interface = Token::at(token_contract_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            liquidity_provider,
            amm_contract,
            deposit_amount,
            1,
        );

    // Add authwit such that the AMM can transfer the deposit amount of the liquidity provider to the public balance of
    // itself.
    add_private_authwit_from_call_interface(
        liquidity_provider,
        amm_contract,
        transfer_call_interface,
    );

    // Impersonate the AMM and initiate the transfer
    let partial_note = env.call_private(amm_contract, transfer_call_interface).return_value;

    // Check balances before the partial note is finalized
    utils::check_private_balance(
        env,
        token_contract_address,
        liquidity_provider,
        mint_amount - deposit_amount,
    );
    utils::check_public_balance(env, token_contract_address, amm_contract, deposit_amount);

    // Now we finalize the partial change note by impersonating the AMM contract and calling the finalize function
    // --> this should send the `change_amount` from AMM's public balance to liquidity provider's private balance
    let change_amount = deposit_amount / (2 as u128);

    let _ = env.call_public(
        amm_contract,
        Token::at(token_contract_address).finalize_transfer_to_private(change_amount, partial_note),
    );

    // Check balances after the partial note is finalized
    utils::check_private_balance(
        env,
        token_contract_address,
        liquidity_provider,
        mint_amount - deposit_amount + change_amount,
    );
    utils::check_public_balance(
        env,
        token_contract_address,
        amm_contract,
        deposit_amount - change_amount,
    );
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn transfer_to_public_and_prepare_private_balance_increase_failure_more_than_balance() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, sender, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    let transfer_amount = mint_amount + (1 as u128);
    let _ = env.call_private(
        sender,
        Token::at(token_contract_address).transfer_to_public_and_prepare_private_balance_increase(
            sender,
            recipient,
            transfer_amount,
            0,
        ),
    );
}

#[test(should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero")]
unconstrained fn transfer_to_public_and_prepare_private_balance_increase_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, sender, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    let transfer_amount = mint_amount / (10 as u128);
    let _ = env.call_private(
        sender,
        Token::at(token_contract_address).transfer_to_public_and_prepare_private_balance_increase(
            sender,
            recipient,
            transfer_amount,
            random(),
        ),
    );
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_to_public_and_prepare_private_balance_increase_failure_on_behalf_of_other_no_approval() {
    let (env, token_contract_address, sender, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);

    let transfer_amount = mint_amount / (10 as u128);
    let transfer_call_interface = Token::at(token_contract_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            sender,
            recipient,
            transfer_amount,
            1,
        );

    // Try executing transfer without approval
    let _ = env.call_private(recipient, transfer_call_interface);
}
