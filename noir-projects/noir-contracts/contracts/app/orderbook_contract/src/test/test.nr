use crate::{
    Orderbook,
    test::utils::{
        check_private_balance, check_public_balance, mint_to_private, setup_orderbook_with_tokens,
    },
};
use aztec::{
    protocol_types::{address::AztecAddress, traits::FromField},
    test::helpers::authwit::add_private_authwit_from_call_interface,
};
use token::Token;
use uint_note::uint_note::PartialUintNote;

#[test]
unconstrained fn create_order_happy_path() {
    let (mut env, orderbook_address, token0_address, token1_address, owner, _) =
        setup_orderbook_with_tokens(true);

    let bid_amount = 1000 as u128;
    let ask_amount = 2000 as u128;
    let authwit_nonce = 1;

    // Mint tokens to owner
    mint_to_private(env, token0_address, owner, owner, bid_amount);

    // Create authwit for transferring tokens to orderbook
    let transfer_call_interface = Token::at(token0_address).transfer_to_public(
        owner,
        orderbook_address,
        bid_amount,
        authwit_nonce,
    );
    add_private_authwit_from_call_interface(owner, orderbook_address, transfer_call_interface);

    // Create order
    let _order_id = env.call_private(
        owner,
        Orderbook::at(orderbook_address).create_order(
            token0_address,
            token1_address,
            bid_amount,
            ask_amount,
            authwit_nonce,
        ),
    );

    // Verify tokens were transferred to orderbook's public balance
    check_public_balance(env, token0_address, orderbook_address, bid_amount);
    check_private_balance(env, token0_address, owner, 0);
}

#[test]
unconstrained fn full_flow() {
    let (mut env, orderbook_address, token0_address, token1_address, maker, _) =
        setup_orderbook_with_tokens(true);

    let taker = env.create_contract_account();
    let bid_amount = 1000 as u128;
    let ask_amount = 2000 as u128;
    let authwit_nonce_create = 1;
    let authwit_nonce_fulfill = 2;

    // Setup: mint tokens to maker and taker
    mint_to_private(env, token0_address, maker, maker, bid_amount);
    mint_to_private(env, token1_address, maker, taker, ask_amount);

    // Create order first
    let transfer_call_interface = Token::at(token0_address).transfer_to_public(
        maker,
        orderbook_address,
        bid_amount,
        authwit_nonce_create,
    );
    add_private_authwit_from_call_interface(maker, orderbook_address, transfer_call_interface);

    let order_id = env.call_private(
        maker,
        Orderbook::at(orderbook_address).create_order(
            token0_address,
            token1_address,
            bid_amount,
            ask_amount,
            authwit_nonce_create,
        ),
    );

    // Get order and verify it's active
    let (order, is_fulfilled) =
        env.simulate_utility(Orderbook::at(orderbook_address).get_order(order_id));

    assert_eq(order.bid_amount, bid_amount);
    assert_eq(order.ask_amount, ask_amount);
    assert_eq(order.bid_token_is_zero, true); // token0 -> token1
    assert_eq(is_fulfilled, false);

    // Create authwit for taker to transfer ask tokens
    // Convert order_id back to PartialUintNote as the orderbook does
    let maker_partial_note = PartialUintNote::from_field(order_id);
    let fulfill_transfer_call_interface = Token::at(token1_address)
        .finalize_transfer_to_private_from_private(
            taker,
            maker_partial_note,
            ask_amount,
            authwit_nonce_fulfill,
        );
    add_private_authwit_from_call_interface(
        taker,
        orderbook_address,
        fulfill_transfer_call_interface,
    );

    // Fulfill order
    env.call_private(
        taker,
        Orderbook::at(orderbook_address).fulfill_order(order_id, authwit_nonce_fulfill),
    );

    // Verify final balances
    check_private_balance(env, token0_address, maker, 0);
    check_private_balance(env, token1_address, maker, ask_amount);
    check_private_balance(env, token0_address, taker, bid_amount);
    check_private_balance(env, token1_address, taker, 0);

    // Get order and verify it's fulfilled
    let (order, is_fulfilled) =
        env.simulate_utility(Orderbook::at(orderbook_address).get_order(order_id));

    assert_eq(order.bid_amount, bid_amount);
    assert_eq(order.ask_amount, ask_amount);
    assert_eq(order.bid_token_is_zero, true); // token0 -> token1
    assert_eq(is_fulfilled, true);
}

#[test(should_fail_with = "ZERO_BID_AMOUNT")]
unconstrained fn create_order_zero_bid_amount() {
    let (mut env, orderbook_address, token0_address, token1_address, owner, _) =
        setup_orderbook_with_tokens(false);

    let bid_amount = 0 as u128;
    let ask_amount = 2000 as u128;
    let authwit_nonce = 1;

    let _order_id = env.call_private(
        owner,
        Orderbook::at(orderbook_address).create_order(
            token0_address,
            token1_address,
            bid_amount,
            ask_amount,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "ZERO_ASK_AMOUNT")]
unconstrained fn create_order_zero_ask_amount() {
    let (mut env, orderbook_address, token0_address, token1_address, owner, _) =
        setup_orderbook_with_tokens(false);

    let bid_amount = 1000 as u128;
    let ask_amount = 0 as u128;
    let authwit_nonce = 1;

    let _order_id = env.call_private(
        owner,
        Orderbook::at(orderbook_address).create_order(
            token0_address,
            token1_address,
            bid_amount,
            ask_amount,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "BID_TOKEN_IS_INVALID")]
unconstrained fn create_order_invalid_bid_token() {
    let (mut env, orderbook_address, _token0_address, token1_address, owner, _) =
        setup_orderbook_with_tokens(false);

    let invalid_token = AztecAddress::from_field(999);
    let bid_amount = 1000 as u128;
    let ask_amount = 2000 as u128;
    let authwit_nonce = 1;

    let _order_id = env.call_private(
        owner,
        Orderbook::at(orderbook_address).create_order(
            invalid_token,
            token1_address,
            bid_amount,
            ask_amount,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "ASK_TOKEN_IS_INVALID")]
unconstrained fn create_order_invalid_ask_token() {
    let (mut env, orderbook_address, token0_address, _token1_address, owner, _) =
        setup_orderbook_with_tokens(false);

    let invalid_token = AztecAddress::from_field(999);
    let bid_amount = 1000 as u128;
    let ask_amount = 2000 as u128;
    let authwit_nonce = 1;

    let _order_id = env.call_private(
        owner,
        Orderbook::at(orderbook_address).create_order(
            token0_address,
            invalid_token,
            bid_amount,
            ask_amount,
            authwit_nonce,
        ),
    );
}

#[test(should_fail_with = "SAME_TOKEN_TRADE")]
unconstrained fn create_order_same_tokens() {
    let (mut env, orderbook_address, token0_address, _token1_address, owner, _) =
        setup_orderbook_with_tokens(false);

    let bid_amount = 1000 as u128;
    let ask_amount = 2000 as u128;
    let authwit_nonce = 1;

    let _order_id = env.call_private(
        owner,
        Orderbook::at(orderbook_address).create_order(
            token0_address,
            token0_address,
            bid_amount,
            ask_amount,
            authwit_nonce,
        ),
    );
}
