use aztec::protocol_types::traits::{Deserialize, Packable, Serialize};

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
