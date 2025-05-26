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
        token_in: AztecAddress,
        token_out: AztecAddress,
    ) -> bool {
        assert((token_in == self.token0) | (token_in == self.token1), "TOKEN_IN_IS_INVALID");
        assert((token_out == self.token0) | (token_out == self.token1), "TOKEN_OUT_IS_INVALID");
        assert(token_in != token_out, "SAME_TOKEN_TRADE");

        token_in == self.token0
    }

    pub fn get_tokens(self, token_in_is_zero: bool) -> (AztecAddress, AztecAddress) {
        if token_in_is_zero {
            (self.token0, self.token1)
        } else {
            (self.token1, self.token0)
        }
    }
}
