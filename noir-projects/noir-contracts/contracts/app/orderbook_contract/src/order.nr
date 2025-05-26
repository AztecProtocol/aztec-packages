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
