use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

global CONFIG_LENGTH: u32 = 3;

/// We store the tokens of the pool in a struct such that to load it from SharedImmutable asserts only a single
/// merkle proof.
/// (Once we actually do the optimization. WIP in https://github.com/AztecProtocol/aztec-packages/pull/8022).
#[derive(Serialize, Deserialize)]
pub struct Config {
    pub token0: AztecAddress,
    pub token1: AztecAddress,
    pub liquidity_token: AztecAddress,
}

/// We implement the Packable trait for Config because it can be stored in contract's storage (and there
/// the implementation of Packable is required).
impl Packable<CONFIG_LENGTH> for Config {
    fn pack(self: Self) -> [Field; CONFIG_LENGTH] {
        self.serialize()
    }

    fn unpack(fields: [Field; CONFIG_LENGTH]) -> Self {
        Self::deserialize(fields)
    }
}
