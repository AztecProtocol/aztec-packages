use crate::{
    abis::side_effect::{Ordered, OrderedValue, Scoped},
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct LogHash {
    pub value: Field,
    pub counter: u32,
    pub length: Field,
}

impl Ordered for LogHash {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl OrderedValue<Field> for LogHash {
    fn value(self) -> Field {
        self.value
    }
}

impl Empty for LogHash {
    fn empty() -> Self {
        LogHash { value: 0, counter: 0, length: 0 }
    }
}

impl LogHash {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedLogHash {
        ScopedLogHash { log_hash: self, contract_address }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct ScopedLogHash {
    pub log_hash: LogHash,
    pub contract_address: AztecAddress,
}

impl Scoped<LogHash> for ScopedLogHash {
    fn inner(self) -> LogHash {
        self.log_hash
    }
    fn contract_address(self) -> AztecAddress {
        self.contract_address
    }
}

impl Ordered for ScopedLogHash {
    fn counter(self) -> u32 {
        self.log_hash.counter
    }
}

impl OrderedValue<Field> for ScopedLogHash {
    fn value(self) -> Field {
        self.log_hash.value
    }
}

impl Empty for ScopedLogHash {
    fn empty() -> Self {
        ScopedLogHash { log_hash: LogHash::empty(), contract_address: AztecAddress::empty() }
    }
}

impl ScopedLogHash {
    pub fn expose_to_public(self) -> Self {
        // Hide the counter when exposing to public.
        Self {
            log_hash: LogHash {
                value: self.log_hash.value,
                counter: 0,
                length: self.log_hash.length,
            },
            contract_address: self.contract_address,
        }
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
