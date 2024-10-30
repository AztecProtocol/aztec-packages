use crate::traits::Deserialize;
use std::meta::derive;

pub global INDEXED_TAGGING_SECRET_LENGTH: u32 = 2;

#[derive(Deserialize)]
pub struct IndexedTaggingSecret {
    secret: Field,
    index: u32,
}
