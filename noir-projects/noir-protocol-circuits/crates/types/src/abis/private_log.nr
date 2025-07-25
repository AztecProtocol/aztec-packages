use crate::{
    abis::{log::Log, side_effect::{Ordered, scoped::Scoped}},
    address::AztecAddress,
    constants::{PRIVATE_LOG_DATA_LENGTH, PRIVATE_LOG_SIZE_IN_FIELDS},
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

pub type PrivateLog = Log<PRIVATE_LOG_SIZE_IN_FIELDS>;

#[derive(Eq, Deserialize, Serialize)]
pub struct PrivateLogData {
    pub log: Log<PRIVATE_LOG_SIZE_IN_FIELDS>,
    // The counter of the note hash this log is for. 0 if it does not link to a note hash.
    pub note_hash_counter: u32,
    pub counter: u32,
}

impl Ordered for PrivateLogData {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Empty for PrivateLogData {
    fn empty() -> Self {
        PrivateLogData { log: PrivateLog::empty(), note_hash_counter: 0, counter: 0 }
    }
}

impl PrivateLogData {
    pub fn scope(self, contract_address: AztecAddress) -> Scoped<Self> {
        Scoped { inner: self, contract_address }
    }
}

impl Ordered for Scoped<PrivateLogData> {
    fn counter(self) -> u32 {
        self.inner.counter
    }
}

impl Scoped<PrivateLogData> {
    pub fn expose_to_public(self) -> PrivateLog {
        self.inner.log
    }
}

#[test]
fn test_private_log_data_serialization() {
    let item = PrivateLogData { log: PrivateLog::empty(), note_hash_counter: 123, counter: 456 };

    // We use the PRIVATE_LOG_DATA_LENGTH constant to ensure that there is a match
    // between the derived trait implementation and the constant
    let serialized: [Field; PRIVATE_LOG_DATA_LENGTH] = item.serialize();
    let deserialized = PrivateLogData::deserialize(serialized);
    assert(item.eq(deserialized));
}
