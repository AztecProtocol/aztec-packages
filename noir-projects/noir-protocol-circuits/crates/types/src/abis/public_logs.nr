use crate::abis::log::Log;
use crate::address::aztec_address::AztecAddress;
use crate::constants::PUBLIC_LOGS_PAYLOAD_LENGTH;
use crate::traits::{Deserialize, Empty, Serialize, ToField};

#[derive(Eq, Serialize, Deserialize)]
pub struct PublicLogs {
    pub length: u32,
    pub payload: [Field; PUBLIC_LOGS_PAYLOAD_LENGTH],
}

impl PublicLogs {
    // Builds a PublicLogs struct from payload and length. Performs no validation, it's expected that length is validated beforehand.
    pub fn new(payload: [Field; PUBLIC_LOGS_PAYLOAD_LENGTH], length: u32) -> Self {
        Self { payload, length }
    }

    pub fn add_log<let N: u32>(&mut self, contract_address: AztecAddress, log: Log<N>) {
        self.payload[self.length] = log.length as Field;
        self.payload[self.length + 1] = contract_address.to_field();
        for i in 0..log.length {
            self.payload[self.length + 2 + i] = log.fields[i];
        }
        self.length += log.length + 2;
    }
}

impl Empty for PublicLogs {
    fn empty() -> Self {
        Self { payload: [0; PUBLIC_LOGS_PAYLOAD_LENGTH], length: 0 }
    }
}
