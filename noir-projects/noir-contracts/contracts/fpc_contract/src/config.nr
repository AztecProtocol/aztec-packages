use dep::aztec::protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

/// We store the addresses in a struct such that to load it from PublicImmutable asserts only a single
/// merkle proof.
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    pub accepted_asset: AztecAddress, // Asset the FPC accepts (denoted as AA below)
    pub admin: AztecAddress, // Address to which AA is sent during the private fee payment flow
}
