use dep::aztec::protocol_types::{address::AztecAddress, traits::Packable};
use std::meta::derive;

/// We store the values in a struct such that to load it from PublicImmutable asserts only a single
/// merkle proof.
#[derive(Eq, Packable)]
pub struct Config {
    pub target_address: AztecAddress,
    pub subscription_token_address: AztecAddress,
    pub subscription_recipient_address: AztecAddress,
    pub subscription_price: U128,
    pub fee_juice_limit_per_tx: Field,
}
