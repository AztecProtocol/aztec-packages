use crate::{
    abis::{log::Log, side_effect::Scoped},
    address::AztecAddress,
    constants::PUBLIC_LOG_DATA_SIZE_IN_FIELDS,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicLog {
    pub log: Log<PUBLIC_LOG_DATA_SIZE_IN_FIELDS>,
    pub contract_address: AztecAddress,
}

impl Scoped<Log<PUBLIC_LOG_DATA_SIZE_IN_FIELDS>> for PublicLog {
    fn inner(self) -> Log<PUBLIC_LOG_DATA_SIZE_IN_FIELDS> {
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

mod test {
    use crate::{
        abis::{log::Log, public_log::PublicLog},
        address::AztecAddress,
        constants::PUBLIC_LOG_SIZE_IN_FIELDS,
        traits::{Deserialize, Serialize},
    };

    #[test]
    fn serialization_of_public_log() {
        let item = PublicLog {
            log: Log::deserialize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
            contract_address: AztecAddress::from_field(14),
        };
        // We use the PUBLIC_LOG_SIZE_IN_FIELDS constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; PUBLIC_LOG_SIZE_IN_FIELDS] = item.serialize();
        let deserialized = PublicLog::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
