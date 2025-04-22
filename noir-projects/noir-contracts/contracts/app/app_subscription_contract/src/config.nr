use dep::aztec::protocol_types::{address::AztecAddress, traits::Packable};
use std::meta::derive;

// PublicImmutable has constant read cost in private regardless of the size of what it stores, so we put all immutable
// values in a single struct
#[derive(Eq, Packable)]
pub struct Config {
    pub target_address: AztecAddress,
    pub subscription_token_address: AztecAddress,
    pub subscription_recipient_address: AztecAddress,
    pub subscription_price: u128,
    pub fee_juice_limit_per_tx: Field,
}
