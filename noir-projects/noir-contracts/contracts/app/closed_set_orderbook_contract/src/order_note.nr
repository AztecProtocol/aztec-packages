use crate::config::Config;
use aztec::{macros::notes::note, protocol_types::address::AztecAddress};

// TODO: Current macros would not pack this efficiently. Add manual Packable impl. or optimize the macros.
#[note]
pub struct OrderNote {
    // A unique identifier for this order, stored within the note itself as it's needed to fulfill the order.
    // This field could potentially be removed if we opt to communicate the order ID through event emission instead.
    pub order_id: Field,
    // The "nullificator" address whose nullifier key will be used to compute this note's nullifier.
    // This field is named "owner" to satisfy the `#[note]` macro's requirement of having an "owner" field.
    // The term 'nullificator' more precisely describes this field's role, as it represents an entity that can only
    // nullify the note. This differs from an 'owner' which traditionally has both nullification and viewing
    // privileges. Hence using 'owner' here is a bit misleading.
    pub owner: AztecAddress,
    // The order maker (who submitted the order). Used to send the `ask_token` note to the maker when the order is
    // fulfilled.
    // TODO: With constrained tagging could we drop this field and save DA costs? (I am currently ignorant about
    // how constrained tagging is supposed to work as I have not yet managed to catch up on Mike's hackmd.)
    pub maker: AztecAddress,
    // Amount of bid tokens
    pub bid_amount: u128,
    // Amount of ask tokens
    pub ask_amount: u128,
    // Whether the order is from token0 to token1 or from token1 to token0
    pub bid_token_is_zero: bool,
}

impl OrderNote {
    pub fn new(
        order_id: Field,
        config: Config,
        owner: AztecAddress,
        maker: AztecAddress,
        bid_amount: u128,
        ask_amount: u128,
        bid_token: AztecAddress,
        ask_token: AztecAddress,
    ) -> Self {
        assert(bid_amount > 0 as u128, "ZERO_BID_AMOUNT");
        assert(ask_amount > 0 as u128, "ZERO_ASK_AMOUNT");

        let bid_token_is_zero =
            config.validate_input_tokens_and_get_direction(bid_token, ask_token);
        Self { order_id, owner, maker, bid_amount, ask_amount, bid_token_is_zero }
    }
}

mod test {
    use crate::{config::Config, order_note::OrderNote};
    use aztec::protocol_types::{address::AztecAddress, traits::FromField};

    global token0: AztecAddress = AztecAddress::from_field(1);
    global token1: AztecAddress = AztecAddress::from_field(2);
    global token2: AztecAddress = AztecAddress::from_field(3);
    global fee_collector: AztecAddress = AztecAddress::from_field(4);
    global owner: AztecAddress = AztecAddress::from_field(5);
    global maker: AztecAddress = AztecAddress::from_field(6);
    global fee: u16 = 100; // 1%

    #[test]
    unconstrained fn new_order_valid_inputs() {
        let config = Config::new(token0, token1, fee_collector, fee);
        let order_id = 1;
        let bid_amount = 100;
        let ask_amount = 200;

        // Test token0 to token1 direction
        let order = OrderNote::new(
            order_id,
            config,
            owner,
            maker,
            bid_amount,
            ask_amount,
            token0,
            token1,
        );
        assert(order.order_id == order_id);
        assert(order.owner == owner);
        assert(order.maker == maker);
        assert(order.bid_amount == bid_amount);
        assert(order.ask_amount == ask_amount);
        assert(order.bid_token_is_zero);

        // Test token1 to token0 direction
        let order = OrderNote::new(
            order_id,
            config,
            owner,
            maker,
            bid_amount,
            ask_amount,
            token1,
            token0,
        );
        assert(order.order_id == order_id);
        assert(order.owner == owner);
        assert(order.maker == maker);
        assert(order.bid_amount == bid_amount);
        assert(order.ask_amount == ask_amount);
        assert(!order.bid_token_is_zero);
    }

    #[test(should_fail_with = "ZERO_BID_AMOUNT")]
    unconstrained fn new_order_zero_bid_amount() {
        let config = Config::new(token0, token1, fee_collector, fee);
        let order_id = 1;

        let _ = OrderNote::new(order_id, config, owner, maker, 0, 100, token0, token1);
    }

    #[test(should_fail_with = "ZERO_ASK_AMOUNT")]
    unconstrained fn new_order_zero_ask_amount() {
        let config = Config::new(token0, token1, fee_collector, fee);
        let order_id = 1;

        let _ = OrderNote::new(order_id, config, owner, maker, 100, 0, token0, token1);
    }

    #[test(should_fail_with = "BID_TOKEN_IS_INVALID")]
    unconstrained fn new_order_invalid_tokens() {
        let config = Config::new(token0, token1, fee_collector, fee);
        let order_id = 1;

        let _ = OrderNote::new(order_id, config, owner, maker, 100, 100, token2, token1);
    }
}
