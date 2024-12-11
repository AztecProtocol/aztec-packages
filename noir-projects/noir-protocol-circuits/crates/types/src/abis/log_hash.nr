use crate::{
    abis::side_effect::{Ordered, OrderedValue, Scoped},
    address::AztecAddress,
    constants::{LOG_HASH_LENGTH, SCOPED_LOG_HASH_LENGTH},
    traits::{Deserialize, Empty, Serialize},
    utils::{arrays::array_concat, reader::Reader},
};

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
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for LogHash {
    fn eq(self, other: LogHash) -> bool {
        (self.value == other.value)
            & (self.counter == other.counter)
            & (self.length == other.length)
    }
}

impl Empty for LogHash {
    fn empty() -> Self {
        LogHash { value: 0, counter: 0, length: 0 }
    }
}

impl Serialize<LOG_HASH_LENGTH> for LogHash {
    fn serialize(self) -> [Field; LOG_HASH_LENGTH] {
        [self.value, self.counter as Field, self.length]
    }
}

impl Deserialize<LOG_HASH_LENGTH> for LogHash {
    fn deserialize(values: [Field; LOG_HASH_LENGTH]) -> Self {
        Self { value: values[0], counter: values[1] as u32, length: values[2] }
    }
}

impl LogHash {
    pub fn scope(self, contract_address: AztecAddress) -> ScopedLogHash {
        ScopedLogHash { log_hash: self, contract_address }
    }
}

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
    fn counter(self) -> u32 {
        self.log_hash.counter
    }
}

impl Eq for ScopedLogHash {
    fn eq(self, other: ScopedLogHash) -> bool {
        (self.log_hash == other.log_hash) & (self.contract_address == other.contract_address)
    }
}

impl Empty for ScopedLogHash {
    fn empty() -> Self {
        ScopedLogHash { log_hash: LogHash::empty(), contract_address: AztecAddress::empty() }
    }
}

impl Serialize<SCOPED_LOG_HASH_LENGTH> for ScopedLogHash {
    fn serialize(self) -> [Field; SCOPED_LOG_HASH_LENGTH] {
        array_concat(
            self.log_hash.serialize(),
            [self.contract_address.to_field()],
        )
    }
}

impl Deserialize<SCOPED_LOG_HASH_LENGTH> for ScopedLogHash {
    fn deserialize(values: [Field; SCOPED_LOG_HASH_LENGTH]) -> Self {
        let mut reader = Reader::new(values);
        let res = Self {
            log_hash: reader.read_struct(LogHash::deserialize),
            contract_address: reader.read_struct(AztecAddress::deserialize),
        };
        reader.finish();
        res
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
