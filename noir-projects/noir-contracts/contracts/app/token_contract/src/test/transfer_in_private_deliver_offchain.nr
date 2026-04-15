use crate::test::utils;
use crate::Token;
use aztec::test::helpers::authwit::add_private_authwit_from_call;
use generic_proxy_contract::GenericProxy;

#[test]
unconstrained fn transfer_in_private_deliver_offchain_updates_both_balances() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount, proxy) =
        utils::setup_and_mint_to_private_with_proxy();

    // Add authwit
    let transfer_amount = 1000 as u128;
    let transfer_call = Token::at(token_contract_address).transfer_in_private_deliver_offchain(
        owner,
        recipient,
        transfer_amount,
        1,
    );
    add_private_authwit_from_call(env, owner, proxy, transfer_call);

    // Transfer tokens. The offchain-delivered notes (change note for the sender, balance note for the recipient,
    // Transfer event) end up in TXE's offchain effect buffer.
    env.call_private(
        owner,
        GenericProxy::at(proxy).forward_private_4(
            transfer_call.target_contract,
            transfer_call.selector,
            transfer_call.args,
        ),
    );

    let messages = env.offchain_messages();
    env.deliver_offchain_messages(token_contract_address, messages);

    utils::check_private_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - transfer_amount,
    );
    utils::check_private_balance(env, token_contract_address, recipient, transfer_amount);
}

#[test(should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero")]
unconstrained fn transfer_in_private_deliver_offchain_failure_on_behalf_of_self_non_zero_nonce() {
    // Setup without account contracts. We are not using authwits here, so dummy accounts are enough
    let (env, token_contract_address, owner, recipient, _) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    // Add authwit
    let transfer_amount = 1000 as u128;
    let transfer_call = Token::at(token_contract_address).transfer_in_private_deliver_offchain(
        owner,
        recipient,
        transfer_amount,
        1,
    );
    add_private_authwit_from_call(env, owner, recipient, transfer_call);
    // Transfer tokens
    env.call_private(owner, transfer_call);
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn transfer_in_private_deliver_offchain_failure_on_behalf_of_more_than_balance() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, mint_amount, proxy) =
        utils::setup_and_mint_to_private_with_proxy();
    // Add authwit
    let transfer_amount = mint_amount + (1 as u128);
    let transfer_call = Token::at(token_contract_address).transfer_in_private_deliver_offchain(
        owner,
        recipient,
        transfer_amount,
        1,
    );
    add_private_authwit_from_call(env, owner, proxy, transfer_call);
    // Transfer tokens
    env.call_private(
        owner,
        GenericProxy::at(proxy).forward_private_4(
            transfer_call.target_contract,
            transfer_call.selector,
            transfer_call.args,
        ),
    );
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_in_private_deliver_offchain_failure_on_behalf_of_other_without_approval() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, _, proxy) =
        utils::setup_and_mint_to_private_with_proxy();
    // Add authwit
    let transfer_amount = 1000 as u128;
    let transfer_call = Token::at(token_contract_address).transfer_in_private_deliver_offchain(
        owner,
        recipient,
        transfer_amount,
        1,
    );
    // Transfer tokens
    env.call_private(
        owner,
        GenericProxy::at(proxy).forward_private_4(
            transfer_call.target_contract,
            transfer_call.selector,
            transfer_call.args,
        ),
    );
}

#[test(should_fail_with = "Unknown auth witness for message hash")]
unconstrained fn transfer_in_private_deliver_offchain_failure_on_behalf_of_other_wrong_caller() {
    // Setup with account contracts. Slower since we actually deploy them, but needed for authwits.
    let (env, token_contract_address, owner, recipient, _, proxy) =
        utils::setup_and_mint_to_private_with_proxy();
    // Add authwit
    let transfer_amount = 1000 as u128;
    let transfer_call = Token::at(token_contract_address).transfer_in_private_deliver_offchain(
        owner,
        recipient,
        transfer_amount,
        1,
    );
    add_private_authwit_from_call(env, owner, owner, transfer_call);
    // Transfer tokens
    env.call_private(
        owner,
        GenericProxy::at(proxy).forward_private_4(
            transfer_call.target_contract,
            transfer_call.selector,
            transfer_call.args,
        ),
    );
}
