use crate::config::Config;
use aztec::{prelude::AztecAddress, protocol_types::traits::{Deserialize, Packable, Serialize}};

// TODO: We do not necessarily need full 128 bits for the amounts so we could try to pack the whole order into 1 Field
// and save on public storage costs.
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Order {
    // Amount of input tokens
    pub amount_in: u128,
    // Amount of output tokens
    pub amount_out: u128,
    // Whether the order is from token0 to token1 or from token1 to token0
    pub zero_to_one: bool,
}

impl Order {
    pub fn new(
        config: Config,
        amount_in: u128,
        amount_out: u128,
        token_in: AztecAddress,
        token_out: AztecAddress,
    ) -> Self {
        assert(amount_in > 0 as u128, "ZERO_AMOUNT_IN");
        assert(amount_out > 0 as u128, "ZERO_AMOUNT_OUT");

        let zero_to_one = config.validate_input_tokens_and_get_direction(token_in, token_out);

        Self { amount_in, amount_out, zero_to_one }
    }
}
