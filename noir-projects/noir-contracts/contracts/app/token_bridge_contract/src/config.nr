use dep::aztec::protocol_types::{
    address::{AztecAddress, EthAddress},
    traits::{Deserialize, Packable, Serialize},
};
use std::meta::derive;

// PublicImmutable has constant read cost in private regardless of the size of what it stores, so we put all immutable
// values in a single struct
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    pub token: AztecAddress,
    pub portal: EthAddress,
}
