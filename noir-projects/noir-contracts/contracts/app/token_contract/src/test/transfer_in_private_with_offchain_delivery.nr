use crate::test::utils;
use crate::Token;
use aztec::test::helpers::authwit::add_private_authwit_from_call;
use generic_proxy_contract::GenericProxy;

#[test]
unconstrained fn transfer_in_private_with_offchain_delivery_updates_both_balances() {
    let (env, token_contract_address, owner, recipient, mint_amount) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);

    let transfer_amount = 1000 as u128;
    let transfer_call = Token::at(token_contract_address).transfer_in_private_with_offchain_delivery(
        owner,
        recipient,
        transfer_amount,
        0,
    );

    // Transfer tokens. The offchain-delivered notes (change note for the sender, balance note for the recipient,
    // Transfer event) end up in TXE's offchain effect buffer.
    env.call_private(owner, transfer_call);

    // `offchain_messages()` returns up to `MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY` (64), but `offchain_receive` takes at
    // most `MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL` (16). This test only produces a handful of messages, so a single
    // batch suffices.
    let messages = env.offchain_messages();
    let mut batch: BoundedVec<_, aztec::messages::processing::offchain::MAX_OFFCHAIN_MESSAGES_PER_RECEIVE_CALL> =
        BoundedVec::new();
    for i in 0..messages.len() {
        batch.push(messages.get(i));
    }
    env.execute_utility(Token::at(token_contract_address).offchain_receive(batch));

    utils::check_private_balance(
        env,
        token_contract_address,
        owner,
        mint_amount - transfer_amount,
    );
    utils::check_private_balance(env, token_contract_address, recipient, transfer_amount);
}

#[test(should_fail_with = "Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, 'authwit_nonce' must be zero")]
unconstrained fn transfer_in_private_with_offchain_delivery_failure_on_behalf_of_self_non_zero_nonce() {
    let (env, token_contract_address, owner, recipient, _) =
        utils::setup_and_mint_to_private(/* with_account_contracts */ false);
    let transfer_amount = 1000 as u128;
    let transfer_call = Token::at(token_contract_address).transfer_in_private_with_offchain_delivery(
        owner,
        recipient,
        transfer_amount,
        1,
    );
    add_private_authwit_from_call(env, owner, recipient, transfer_call);
    env.call_private(owner, transfer_call);
}

#[test(should_fail_with = "Balance too low")]
unconstrained fn transfer_in_private_with_offchain_delivery_failure_on_behalf_of_more_than_balance() {
    let (env, token_contract_address, owner, recipient, mint_amount, proxy) =
        utils::setup_and_mint_to_private_with_proxy();
    let transfer_amount = mint_amount + (1 as u128);
    let transfer_call = Token::at(token_contract_address).transfer_in_private_with_offchain_delivery(
        owner,
        recipient,
        transfer_amount,
        1,
    );
    add_private_authwit_from_call(env, owner, proxy, transfer_call);
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
unconstrained fn transfer_in_private_with_offchain_delivery_failure_on_behalf_of_other_without_approval() {
    let (env, token_contract_address, owner, recipient, _, proxy) = utils::setup_and_mint_to_private_with_proxy();
    let transfer_amount = 1000 as u128;
    let transfer_call = Token::at(token_contract_address).transfer_in_private_with_offchain_delivery(
        owner,
        recipient,
        transfer_amount,
        1,
    );
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
unconstrained fn transfer_in_private_with_offchain_delivery_failure_on_behalf_of_other_wrong_caller() {
    let (env, token_contract_address, owner, recipient, _, proxy) = utils::setup_and_mint_to_private_with_proxy();
    let transfer_amount = 1000 as u128;
    let transfer_call = Token::at(token_contract_address).transfer_in_private_with_offchain_delivery(
        owner,
        recipient,
        transfer_amount,
        1,
    );
    add_private_authwit_from_call(env, owner, owner, transfer_call);
    env.call_private(
        owner,
        GenericProxy::at(proxy).forward_private_4(
            transfer_call.target_contract,
            transfer_call.selector,
            transfer_call.args,
        ),
    );
}
