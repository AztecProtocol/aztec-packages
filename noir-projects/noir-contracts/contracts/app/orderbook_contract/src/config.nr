use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

/// We store the tokens of the DEX in a struct such that to load it from PublicImmutable asserts only a single
/// merkle proof.
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    token0: AztecAddress,
    token1: AztecAddress,
}

impl Config {
    pub fn new(token0: AztecAddress, token1: AztecAddress) -> Self {
        assert(!token0.eq(token1), "Tokens must be different");
        Self { token0, token1 }
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

    pub fn get_tokens(self, bid_token_is_zero: bool) -> (AztecAddress, AztecAddress) {
        if bid_token_is_zero {
            (self.token0, self.token1)
        } else {
            (self.token1, self.token0)
        }
    }
}
