use crate::traits::{Deserialize, Empty, Serialize};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct Log<let N: u32> {
    pub fields: [Field; N],
    // The actual length (number of fields) of the log to be included in the blobs.
    pub length: u32,
}

impl<let N: u32> Log<N> {
    pub fn new(fields: [Field; N], length: u32) -> Self {
        Self { fields, length }
    }
}

impl<let N: u32> Empty for Log<N> {
    fn empty() -> Log<N> {
        Log { fields: [0; N], length: 0 }
    }
}

#[test]
fn serialization_of_empty_log() {
    let item: Log<5> = Log::empty();
    let serialized = item.serialize();
    let deserialized = Log::deserialize(serialized);
    assert(item.eq(deserialized));
}
