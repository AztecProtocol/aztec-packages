use crate::traits::{Deserialize, Empty, Serialize};
use std::meta::derive;

#[derive(Eq, Serialize)]
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

impl<let M: u32> Deserialize for Log<M> {
    let N: u32 = M + 1; // +1 for length field

    #[inline_always]
    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut log_fields = [0; M];

        // Copy log fields
        for i in 0..M {
            log_fields[i] = fields[i];
        }

        // Get length from last field
        let length = fields[M] as u32;

        Self { fields: log_fields, length }
    }
}
