use crate::{
    abis::side_effect::{counted::Counted, scoped::Scoped},
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct LogHash {
    pub value: Field,
    pub length: u32,
}

impl Empty for LogHash {
    fn empty() -> Self {
        LogHash { value: 0, length: 0 }
    }
}

impl LogHash {
    pub fn count(self, counter: u32) -> Counted<LogHash> {
        Counted::new(self, counter)
    }

    pub fn scope(self, contract_address: AztecAddress) -> Scoped<LogHash> {
        Scoped::new(self, contract_address)
    }
}

#[derive(Deserialize, Eq, Serialize)]
impl Scoped<Counted<LogHash>> {
    pub fn expose_to_public(self) -> Scoped<LogHash> {
        self.inner.inner.scope(self.contract_address)
    }
}

mod test {
    use crate::{
        abis::log_hash::{LogHash, ScopedLogHash},
        address::AztecAddress,
        constants::{LOG_HASH_LENGTH, SCOPED_LOG_HASH_LENGTH},
        traits::{Deserialize, Serialize},
    };

    #[test]
    fn serialization_of_log_hash() {
        let item = LogHash { value: 5, counter: 6, length: 7 };
        // We use the LOG_HASH_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; LOG_HASH_LENGTH] = item.serialize();
        let deserialized = LogHash::deserialize(serialized);
        assert_eq(item, deserialized);
    }

    #[test]
    fn serialization_of_scoped_log_hash() {
        let item = ScopedLogHash {
            log_hash: LogHash { value: 5, counter: 6, length: 7 },
            contract_address: AztecAddress::zero(),
        };
        // We use the SCOPED_LOG_HASH_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; SCOPED_LOG_HASH_LENGTH] = item.serialize();
        let deserialized = ScopedLogHash::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
