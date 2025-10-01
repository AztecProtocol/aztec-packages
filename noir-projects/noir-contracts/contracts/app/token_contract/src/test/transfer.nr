use crate::test::utils;
use crate::Token;

#[test]
unconstrained fn transfer_private() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    // Transfer tokens
    let transfer_amount = 1000 as u128;
    env.call_private(owner, Token::at(token_contract_address).transfer(recipient, transfer_amount));
    // Check balances
    utils::check_private_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - transfer_amount,
    );
    utils::check_private_balance(env, token_contract_address, recipient, transfer_amount);
}

#[test]
unconstrained fn transfer_private_to_self() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = 1000 as u128;
    let _ =
        env.call_private(owner, Token::at(token_contract_address).transfer(owner, transfer_amount));

    // Check balances
    utils::check_private_balance(env, token_contract_address, owner, mint_amount);
}

#[test]
unconstrained fn transfer_private_to_non_deployed_account() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (mut env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    let not_deployed = env.create_light_account();

    // Transfer tokens
    let transfer_amount = 1000 as u128;
    env.call_private(
        owner,
        Token::at(token_contract_address).transfer(not_deployed, transfer_amount),
    );

    // Check balances
    utils::check_private_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - transfer_amount,
    );
    utils::check_private_balance(env, token_contract_address, not_deployed, transfer_amount);
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn transfer_private_failure_more_than_balance() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount + (1 as u128);
    env.call_private(owner, Token::at(token_contract_address).transfer(recipient, transfer_amount));
}
