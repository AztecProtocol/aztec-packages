use crate::config::Config;
use aztec::{prelude::AztecAddress, protocol_types::traits::{Deserialize, Packable, Serialize}};

// TODO: We do not necessarily need full 128 bits for the amounts so we could try to pack the whole order into 1 Field
// and save on public storage costs.
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Order {
    // Amount of bid tokens
    pub bid_amount: u128,
    // Amount of ask tokens
    pub ask_amount: u128,
    // Whether the order is from token0 to token1 or from token1 to token0
    pub bid_token_is_zero: bool,
}

impl Order {
    pub fn new(
        config: Config,
        bid_amount: u128,
        ask_amount: u128,
        bid_token: AztecAddress,
        ask_token: AztecAddress,
    ) -> Self {
        assert(bid_amount > 0 as u128, "ZERO_BID_AMOUNT");
        assert(ask_amount > 0 as u128, "ZERO_ASK_AMOUNT");

        let bid_token_is_zero =
            config.validate_input_tokens_and_get_direction(bid_token, ask_token);

        Self { bid_amount, ask_amount, bid_token_is_zero }
    }
}

mod test {
    use crate::{config::Config, order::Order};
    use aztec::{prelude::AztecAddress, protocol_types::traits::FromField};

    #[test]
    unconstrained fn new_order_valid_inputs() {
        let token0 = AztecAddress::from_field(1);
        let token1 = AztecAddress::from_field(2);
        let config = Config::new(token0, token1);

        let bid_amount = 100;
        let ask_amount = 200;

        // Test token0 to token1 direction
        let order = Order::new(config, bid_amount, ask_amount, token0, token1);
        assert(order.bid_amount == bid_amount);
        assert(order.ask_amount == ask_amount);
        assert(order.bid_token_is_zero == true);

        // Test token1 to token0 direction
        let order = Order::new(config, bid_amount, ask_amount, token1, token0);
        assert(order.bid_amount == bid_amount);
        assert(order.ask_amount == ask_amount);
        assert(order.bid_token_is_zero == false);
    }

    #[test(should_fail_with = "ZERO_BID_AMOUNT")]
    unconstrained fn new_order_zero_bid_amount() {
        let token0 = AztecAddress::from_field(1);
        let token1 = AztecAddress::from_field(2);
        let config = Config::new(token0, token1);

        let _ = Order::new(config, 0, 100, token0, token1);
    }

    #[test(should_fail_with = "ZERO_ASK_AMOUNT")]
    unconstrained fn new_order_zero_ask_amount() {
        let token0 = AztecAddress::from_field(1);
        let token1 = AztecAddress::from_field(2);
        let config = Config::new(token0, token1);

        let _ = Order::new(config, 100, 0, token0, token1);
    }

    #[test(should_fail_with = "BID_TOKEN_IS_INVALID")]
    unconstrained fn new_order_invalid_tokens() {
        let token0 = AztecAddress::from_field(1);
        let token1 = AztecAddress::from_field(2);
        let token2 = AztecAddress::from_field(3);
        let config = Config::new(token0, token1);

        let _ = Order::new(config, 100, 100, token2, token1);
    }
}
