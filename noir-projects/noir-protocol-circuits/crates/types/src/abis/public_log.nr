use crate::{
    abis::{log::Log, side_effect::Scoped},
    address::AztecAddress,
    constants::{PUBLIC_LOG_LENGTH, PUBLIC_LOG_SIZE_IN_FIELDS},
    traits::{Deserialize, Empty, FromField, Serialize},
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
fn serialization_of_public_log() {
    let mut log = Log::empty();
    log.length = PUBLIC_LOG_SIZE_IN_FIELDS - 2;
    for i in 0..PUBLIC_LOG_SIZE_IN_FIELDS - 2 {
        log.fields[i] = 10000 + i as Field;
    }

    let item = PublicLog { log, contract_address: AztecAddress::from_field(123) };
    // We use the PUBLIC_LOG_LENGTH constant to ensure that there is a match between the derived trait
    // implementation and the constant.
    let serialized: [Field; PUBLIC_LOG_LENGTH] = item.serialize();
    let deserialized = PublicLog::deserialize(serialized);
    assert(item.eq(deserialized));
}
