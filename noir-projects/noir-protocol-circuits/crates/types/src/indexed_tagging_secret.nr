use crate::traits::Deserialize;
use super::address::aztec_address::AztecAddress;
use std::meta::derive;

pub global INDEXED_TAGGING_SECRET_LENGTH: u32 = 3;

#[derive(Deserialize)]
pub struct IndexedTaggingSecret {
    secret: Field,
    recipient: AztecAddress,
    index: u32,
}
