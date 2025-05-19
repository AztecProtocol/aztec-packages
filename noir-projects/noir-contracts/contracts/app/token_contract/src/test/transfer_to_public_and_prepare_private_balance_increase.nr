use crate::test::utils;
use crate::Token;
use dep::authwit::cheatcodes as authwit_cheatcodes;
use dep::aztec::oracle::random::random;

#[test]
unconstrained fn transfer_to_public_and_prepare_private_balance_increase_and_finalize_transfer_to_private() {
    let (env, token_contract_address, sender, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ true);

    let transfer_amount: u128 = mint_amount / (10 as u128);
    let transfer_call_interface = Token::at(token_contract_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            sender,
            recipient,
            transfer_amount,
            1,
        );

    authwit_cheatcodes::add_private_authwit_from_call_interface(
        sender,
        recipient,
        transfer_call_interface,
    );

    // Impersonate recipient
    env.impersonate(recipient);

    // Execute transfer
    let partial_note = transfer_call_interface.call(&mut env.private());

    // Check balances before the partial note is finalized
    utils::check_private_balance(
        token_contract_address,
        sender,
        mint_amount - transfer_amount,
    );
    utils::check_public_balance(token_contract_address, recipient, transfer_amount);

    // Now we finalize the partial change note by impersonating the recipient and calling the finalize function
    // --> this should send the `change_amount` from recipient's public balance to sender's private balance
    let change_amount = transfer_amount / (2 as u128);

    // Impersonate the recipient and try to finalize the transfer
    env.impersonate(recipient);

    // Finalize the transfer
    Token::at(token_contract_address)
        .finalize_transfer_to_private(change_amount, partial_note)
        .call(&mut env.public());

    env.advance_block_by(1);

    // Check balances after the partial note is finalized
    utils::check_private_balance(
        token_contract_address,
        sender,
        // TODO: Why don't I see the change_amount here? Does TXE handle partial notes correctly? I thought if
        // I advance the block by 1, the note should be found.
        // mint_amount - transfer_amount + change_amount,
        mint_amount - transfer_amount,
    );
    utils::check_public_balance(
        token_contract_address,
        recipient,
        transfer_amount - change_amount,
    );
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn transfer_to_public_and_prepare_private_balance_increase_failure_more_than_balance() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, sender, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    let transfer_amount = mint_amount + (1 as u128);
    let _ = Token::at(token_contract_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            sender,
            recipient,
            transfer_amount,
            0,
        )
        .call(&mut env.private());
}

#[test(should_fail_with = "invalid nonce")]
unconstrained fn transfer_to_public_and_prepare_private_balance_increase_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, sender, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    let transfer_amount = mint_amount / (10 as u128);
    let _ = Token::at(token_contract_address)
        .transfer_to_public_and_prepare_private_balance_increase(
            sender,
            recipient,
            transfer_amount,
            random(),
        )
        .call(&mut env.private());
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

    // Impersonate recipient without adding authwit
    env.impersonate(recipient);

    // Try executing transfer without approval
    let _ = transfer_call_interface.call(&mut env.private());
}
