use crate::traits::{Deserialize, Empty, Serialize};
use std::meta::derive;

#[derive(Eq)]
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

// Note: We currently don't support derivation of Serialize and Deserialize traits for types with generics so we have
// the manual implementation below.
impl<let N: u32> Serialize for Log<N> {
    let N: u32 = N + 1; // +1 for length field

    #[inline_always]
    fn serialize(self) -> [Field; Self::N] {
        let mut result = [0; Self::N];

        // Copy log fields
        for i in 0..N {
            result[i] = self.fields[i];
        }

        // Store length as last field
        result[N] = self.length as Field;

        result
    }
}

impl<let N: u32> Deserialize for Log<N> {
    let N: u32 = N + 1; // +1 for length field

    #[inline_always]
    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut log_fields = [0; N];

        // Copy log fields
        for i in 0..N {
            log_fields[i] = fields[i];
        }

        // Get length from last field
        let length = fields[N] as u32;

        Self { fields: log_fields, length }
    }
}
