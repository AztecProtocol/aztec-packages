use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

/// We store the tokens of the pool in a struct such that to load it from PublicImmutable asserts only a single
/// merkle proof.
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    pub token0: AztecAddress,
    pub token1: AztecAddress,
    pub liquidity_token: AztecAddress,
}
