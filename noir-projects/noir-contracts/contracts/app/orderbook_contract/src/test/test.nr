use crate::{Orderbook, test::utils::setup};
use aztec::{
    protocol_types::{address::AztecAddress, traits::FromField},
    test::helpers::authwit::add_private_authwit_from_call_interface,
};
use token::Token;
use uint_note::uint_note::PartialUintNote;

global BID_AMOUNT: u128 = 1000;
global ASK_AMOUNT: u128 = 2000;
global CREATE_ORDER_AUTHWIT_NONCE: Field = 1;
global FULFILL_ORDER_AUTHWIT_NONCE: Field = 2;

/// Checks the full flow of creating an order and fulfilling it.
#[test]
unconstrained fn full_flow() {
    let (mut env, orderbook_address, token0_address, token1_address, minter) = setup();

    // We create a contract account (as opposed to a light account) for the maker and taker to be able to use authwits.
    let maker = env.create_contract_account();
    let taker = env.create_contract_account();

    let token0 = Token::at(token0_address);
    let token1 = Token::at(token1_address);
    let orderbook = Orderbook::at(orderbook_address);

    // Mint tokens to maker and taker
    env.call_private(minter, token0.mint_to_private(maker, BID_AMOUNT));
    env.call_private(minter, token1.mint_to_private(taker, ASK_AMOUNT));

    // ORDER CREATION
    let transfer_call_interface =
        token0.transfer_to_public(maker, orderbook_address, BID_AMOUNT, CREATE_ORDER_AUTHWIT_NONCE);
    add_private_authwit_from_call_interface(env, maker, orderbook_address, transfer_call_interface);

    let order_id = env.call_private(
        maker,
        orderbook.create_order(
            token0_address,
            token1_address,
            BID_AMOUNT,
            ASK_AMOUNT,
            CREATE_ORDER_AUTHWIT_NONCE,
        ),
    );

    // Get order and verify it's active
    let (order, is_fulfilled) = env.simulate_utility(orderbook.get_order(order_id));

    assert_eq(order.bid_amount, BID_AMOUNT);
    assert_eq(order.ask_amount, ASK_AMOUNT);
    assert_eq(order.bid_token_is_zero, true); // token0 -> token1
    assert_eq(is_fulfilled, false);

    // Verify that all maker's tokens were transferred to orderbook's public balance
    assert_eq(env.view_public(token0.balance_of_public(orderbook_address)), BID_AMOUNT);
    assert_eq(env.simulate_utility(token0.balance_of_private(maker)), 0);

    // ORDER FULFILLMENT

    // Convert order_id back to PartialUintNote as the orderbook does and then create authwit for taker to transfer ask
    // tokens.
    let maker_partial_note = PartialUintNote::from_field(order_id);
    let fulfill_transfer_call_interface = token1.finalize_transfer_to_private_from_private(
        taker,
        maker_partial_note,
        ASK_AMOUNT,
        FULFILL_ORDER_AUTHWIT_NONCE,
    );
    add_private_authwit_from_call_interface(
        env,
        taker,
        orderbook_address,
        fulfill_transfer_call_interface,
    );

    env.call_private(taker, orderbook.fulfill_order(order_id, FULFILL_ORDER_AUTHWIT_NONCE));

    // Verify final balances
    assert_eq(env.simulate_utility(token0.balance_of_private(maker)), 0);
    assert_eq(env.simulate_utility(token1.balance_of_private(maker)), ASK_AMOUNT);
    assert_eq(env.simulate_utility(token0.balance_of_private(taker)), BID_AMOUNT);
    assert_eq(env.simulate_utility(token1.balance_of_private(taker)), 0);

    // Get order and verify it's fulfilled
    let (order, is_fulfilled) = env.simulate_utility(orderbook.get_order(order_id));

    assert_eq(order.bid_amount, BID_AMOUNT);
    assert_eq(order.ask_amount, ASK_AMOUNT);
    assert_eq(order.bid_token_is_zero, true); // token0 -> token1
    assert_eq(is_fulfilled, true);
}

#[test(should_fail_with = "ZERO_BID_AMOUNT")]
unconstrained fn create_order_zero_bid_amount() {
    let (mut env, orderbook_address, token0_address, token1_address, _minter) = setup();

    let orderbook = Orderbook::at(orderbook_address);
    let maker = env.create_light_account();

    let _ = env.call_private(
        maker,
        orderbook.create_order(
            token0_address,
            token1_address,
            0,
            ASK_AMOUNT,
            CREATE_ORDER_AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "ZERO_ASK_AMOUNT")]
unconstrained fn create_order_zero_ask_amount() {
    let (mut env, orderbook_address, token0_address, token1_address, _minter) = setup();

    let maker = env.create_light_account();
    let orderbook = Orderbook::at(orderbook_address);

    let _ = env.call_private(
        maker,
        orderbook.create_order(
            token0_address,
            token1_address,
            BID_AMOUNT,
            0,
            CREATE_ORDER_AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "BID_TOKEN_IS_INVALID")]
unconstrained fn create_order_invalid_bid_token() {
    let (mut env, orderbook_address, _token0_address, token1_address, _minter) = setup();

    let maker = env.create_light_account();
    let orderbook = Orderbook::at(orderbook_address);

    let invalid_token = AztecAddress::from_field(999);

    let _ = env.call_private(
        maker,
        orderbook.create_order(
            invalid_token,
            token1_address,
            BID_AMOUNT,
            ASK_AMOUNT,
            CREATE_ORDER_AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "ASK_TOKEN_IS_INVALID")]
unconstrained fn create_order_invalid_ask_token() {
    let (mut env, orderbook_address, token0_address, _token1_address, _minter) = setup();

    let maker = env.create_light_account();
    let orderbook = Orderbook::at(orderbook_address);

    let invalid_token = AztecAddress::from_field(999);

    let _ = env.call_private(
        maker,
        orderbook.create_order(
            token0_address,
            invalid_token,
            BID_AMOUNT,
            ASK_AMOUNT,
            CREATE_ORDER_AUTHWIT_NONCE,
        ),
    );
}

#[test(should_fail_with = "SAME_TOKEN_TRADE")]
unconstrained fn create_order_same_tokens() {
    let (mut env, orderbook_address, token0_address, _token1_address, _minter) = setup();

    let maker = env.create_light_account();
    let orderbook = Orderbook::at(orderbook_address);

    let _ = env.call_private(
        maker,
        orderbook.create_order(
            token0_address,
            token0_address,
            BID_AMOUNT,
            ASK_AMOUNT,
            CREATE_ORDER_AUTHWIT_NONCE,
        ),
    );
}
