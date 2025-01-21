use crate::test::utils;
use crate::Token;
use dep::authwit::cheatcodes as authwit_cheatcodes;
use dep::aztec::test::helpers::cheatcodes;

#[test]
unconstrained fn transfer_private() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    // docs:start:txe_test_transfer_private
    // Transfer tokens
    let transfer_amount = U128::from_integer(1000);
    Token::at(token_contract_address).transfer(recipient, transfer_amount).call(&mut env.private());
    // docs:end:txe_test_transfer_private
    // Check balances
    utils::check_private_balance(token_contract_address, owner, mint_amount - transfer_amount);
    utils::check_private_balance(token_contract_address, recipient, transfer_amount);
}

#[test]
unconstrained fn transfer_private_to_self() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = U128::from_integer(1000);
    Token::at(token_contract_address).transfer(owner, transfer_amount).call(&mut env.private());

    // Check balances
    utils::check_private_balance(token_contract_address, owner, mint_amount);
}

#[test]
unconstrained fn transfer_private_to_non_deployed_account() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, _, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    let not_deployed = cheatcodes::create_account();
    // Transfer tokens
    let transfer_amount = U128::from_integer(1000);
    Token::at(token_contract_address).transfer(not_deployed.address, transfer_amount).call(
        &mut env.private(),
    );

    // Check balances
    utils::check_private_balance(token_contract_address, owner, mint_amount - transfer_amount);
    utils::check_private_balance(
        token_contract_address,
        not_deployed.address,
        transfer_amount,
    );
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn transfer_private_failure_more_than_balance() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, _, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    // Transfer tokens
    let transfer_amount = mint_amount + U128::from_integer(1);
    Token::at(token_contract_address).transfer(recipient, transfer_amount).call(&mut env.private());
}
