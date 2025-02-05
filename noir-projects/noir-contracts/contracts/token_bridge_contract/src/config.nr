use dep::aztec::protocol_types::{
    address::{AztecAddress, EthAddress},
    traits::{Deserialize, Packable, Serialize},
};
use std::meta::derive;

/// We store the values in a struct such that to load it from PublicImmutable asserts only a single
/// merkle proof.
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    pub token: AztecAddress,
    pub portal: EthAddress,
}
