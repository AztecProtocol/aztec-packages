use dep::aztec::protocol_types::{address::{AztecAddress, EthAddress}, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    pub token: AztecAddress,
    pub portal: EthAddress,
}
