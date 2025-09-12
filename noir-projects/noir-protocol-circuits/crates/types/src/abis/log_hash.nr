use crate::{
    abis::side_effect::{counted::Counted, scoped::Scoped},
    address::AztecAddress,
    constants::LOG_HASH_LENGTH,
    traits::{Deserialize, Empty, Serialize},
};

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

impl Scoped<Counted<LogHash>> {
    pub fn expose_to_public(self) -> Scoped<LogHash> {
        self.inner.inner.scope(self.contract_address)
    }
}

#[test]
fn test_log_hash_serialization() {
    let item = LogHash { value: 123, length: 456 };

    // We use the LOG_HASH_LENGTH constant to ensure that there is a match
    // between the derived trait implementation and the constant
    let serialized: [Field; LOG_HASH_LENGTH] = item.serialize();
    let deserialized = LogHash::deserialize(serialized);
    assert(item.eq(deserialized));
}
