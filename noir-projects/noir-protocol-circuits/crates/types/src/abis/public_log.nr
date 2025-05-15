use crate::{
    abis::{log::Log, side_effect::Scoped},
    address::AztecAddress,
    constants::{PUBLIC_LOG_LENGTH, PUBLIC_LOG_SIZE_IN_FIELDS},
    traits::{Deserialize, Empty, Serialize, ToField},
    utils::{arrays::array_concat, reader::Reader},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicLog {
    pub log: Log<PUBLIC_LOG_SIZE_IN_FIELDS>,
    pub contract_address: AztecAddress,
}

impl Scoped<Log<PUBLIC_LOG_SIZE_IN_FIELDS>> for PublicLog {
    fn inner(self) -> Log<PUBLIC_LOG_SIZE_IN_FIELDS> {
        self.log
    }
    fn contract_address(self) -> AztecAddress {
        self.contract_address
    }
}

impl Empty for PublicLog {
    fn empty() -> Self {
        PublicLog { log: Log::empty(), contract_address: AztecAddress::empty() }
    }
}

#[test]
fn serialization_of_empty_public_log() {
    let item = PublicLog::empty();
    let serialized = item.serialize();
    let deserialized = PublicLog::deserialize(serialized);
    assert(item.eq(deserialized));
}
