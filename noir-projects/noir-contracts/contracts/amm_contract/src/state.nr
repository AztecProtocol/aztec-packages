use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

global STATE_LENGTH: u32 = 3;

/// We store the tokens of the pool in a struct such that to load it from SharedImmutable asserts only a single
/// merkle proof.
/// (Once we actually do the optimization. WIP in https://github.com/AztecProtocol/aztec-packages/pull/8022).
struct State {
    token0: AztecAddress,
    token1: AztecAddress,
    liquidity_token: AztecAddress,
}

// Note: I could not get #[derive(Serialize)] to work so I had to implement it manually.
impl Serialize<STATE_LENGTH> for State {
    fn serialize(self: Self) -> [Field; STATE_LENGTH] {
        [self.token0.to_field(), self.token1.to_field(), self.liquidity_token.to_field()]
    }
}

impl Deserialize<STATE_LENGTH> for State {
    fn deserialize(fields: [Field; STATE_LENGTH]) -> Self {
        State {
            token0: AztecAddress::from_field(fields[0]),
            token1: AztecAddress::from_field(fields[1]),
            liquidity_token: AztecAddress::from_field(fields[2]),
        }
    }
}
