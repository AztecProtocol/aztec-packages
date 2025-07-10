use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

/// We store the configuration in a struct such that to load it from SharedMutable asserts only a single merkle proof.
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    token0: AztecAddress,
    token1: AztecAddress,
    pub fee_collector: AztecAddress,
    pub fee: u16, // The fee is defined in basis points (0-10000) hence u16 is sufficient.
}

impl Config {
    pub fn new(
        token0: AztecAddress,
        token1: AztecAddress,
        fee_collector: AztecAddress,
        fee: u16,
    ) -> Self {
        assert(!token0.eq(token1), "Tokens must be different");
        assert(fee <= 10000, "Fee must be in basis points (0-10000)");
        Self { token0, token1, fee_collector, fee }
    }

    pub fn validate_input_tokens_and_get_direction(
        self,
        bid_token: AztecAddress,
        ask_token: AztecAddress,
    ) -> bool {
        assert((bid_token == self.token0) | (bid_token == self.token1), "BID_TOKEN_IS_INVALID");
        assert((ask_token == self.token0) | (ask_token == self.token1), "ASK_TOKEN_IS_INVALID");
        assert(bid_token != ask_token, "SAME_TOKEN_TRADE");

        bid_token == self.token0
    }

    /// Returns a tuple of (bid_token, ask_token) based on `bid_token_is_zero` param.
    pub fn get_tokens(self, bid_token_is_zero: bool) -> (AztecAddress, AztecAddress) {
        if bid_token_is_zero {
            (self.token0, self.token1)
        } else {
            (self.token1, self.token0)
        }
    }
}

// mod test {
//     use crate::config::Config;
//     use aztec::{prelude::AztecAddress, protocol_types::traits::FromField};

//     global token0: AztecAddress = AztecAddress::from_field(1);
//     global token1: AztecAddress = AztecAddress::from_field(2);
//     global token2: AztecAddress = AztecAddress::from_field(3);

//     #[test]
//     unconstrained fn new_config_valid_inputs() {
//         let _ = Config::new(token0, token1);
//     }

//     #[test(should_fail_with = "Tokens must be different")]
//     unconstrained fn new_config_same_tokens() {
//         let _ = Config::new(token0, token0);
//     }

//     #[test]
//     unconstrained fn validate_input_tokens_valid() {
//         let config = Config::new(token0, token1);

//         // Test token0 to token1 direction
//         let is_zero = config.validate_input_tokens_and_get_direction(token0, token1);
//         assert(is_zero);

//         // Test token1 to token0 direction
//         let is_zero = config.validate_input_tokens_and_get_direction(token1, token0);
//         assert(!is_zero);
//     }

//     #[test(should_fail_with = "BID_TOKEN_IS_INVALID")]
//     unconstrained fn validate_input_tokens_invalid_bid() {
//         let config = Config::new(token0, token1);
//         let _ = config.validate_input_tokens_and_get_direction(token2, token1);
//     }

//     #[test(should_fail_with = "ASK_TOKEN_IS_INVALID")]
//     unconstrained fn validate_input_tokens_invalid_ask() {
//         let config = Config::new(token0, token1);
//         let _ = config.validate_input_tokens_and_get_direction(token0, token2);
//     }

//     #[test(should_fail_with = "SAME_TOKEN_TRADE")]
//     unconstrained fn validate_input_tokens_same_token() {
//         let config = Config::new(token0, token1);
//         let _ = config.validate_input_tokens_and_get_direction(token0, token0);
//     }

//     #[test]
//     unconstrained fn get_tokens_correct_order() {
//         let config = Config::new(token0, token1);

//         let is_zero = config.validate_input_tokens_and_get_direction(token0, token1);
//         let (bid, ask) = config.get_tokens(is_zero);
//         assert(bid == token0);
//         assert(ask == token1);

//         let is_zero = config.validate_input_tokens_and_get_direction(token1, token0);
//         let (bid, ask) = config.get_tokens(is_zero);
//         assert(bid == token1);
//         assert(ask == token0);
//     }
// }
