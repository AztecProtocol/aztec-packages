use crate::constants::FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH;
use crate::traits::{Deserialize, Empty, Serialize};

#[derive(Eq, Serialize, Deserialize)]
pub struct PublicLogs {
    pub length: u32,
    pub payload: [Field; FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH],
}

impl PublicLogs {
    // Builds a PublicLogs struct from payload and length. Performs no validation, it's expected that length is validated beforehand.
    pub fn new(payload: [Field; FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH], length: u32) -> Self {
        Self { payload, length }
    }
}

impl Empty for PublicLogs {
    fn empty() -> Self {
        Self { payload: [0; FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH], length: 0 }
    }
}
