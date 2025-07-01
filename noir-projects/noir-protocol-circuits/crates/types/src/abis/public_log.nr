use crate::{
    abis::{log::Log, side_effect::Scoped},
    address::AztecAddress,
    constants::{PUBLIC_LOG_LENGTH, PUBLIC_LOG_SIZE_IN_FIELDS},
    traits::{Deserialize, Empty, Serialize, ToField},
    utils::reader::Reader,
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
