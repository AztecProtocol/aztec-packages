use crate::{
    abis::{log::Log, side_effect::{Ordered, scoped::Scoped}},
    address::AztecAddress,
    constants::{CONTRACT_CLASS_LOG_DATA_LENGTH, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS},
    traits::{Deserialize, Empty, Serialize},
    utils::{arrays::array_concat, reader::Reader},
};

// TODO(MW): add new constant for this - the below is just the largest combination atm
pub type ContractClassLog = Log<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>;

pub struct ContractClassLogData {
    pub log: ContractClassLog,
    pub counter: u32,
}

impl Ordered for ContractClassLogData {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl Eq for ContractClassLogData {
    fn eq(self, other: ContractClassLogData) -> bool {
        (self.log == other.log) & (self.counter == other.counter)
    }
}

impl Empty for ContractClassLogData {
    fn empty() -> Self {
        ContractClassLogData { log: ContractClassLog::empty(), counter: 0 }
    }
}

impl Serialize<CONTRACT_CLASS_LOG_DATA_LENGTH> for ContractClassLogData {
    fn serialize(self) -> [Field; CONTRACT_CLASS_LOG_DATA_LENGTH] {
        array_concat(self.log.serialize(), [self.counter as Field])
    }
}

impl Deserialize<CONTRACT_CLASS_LOG_DATA_LENGTH> for ContractClassLogData {
    fn deserialize(fields: [Field; CONTRACT_CLASS_LOG_DATA_LENGTH]) -> Self {
        let mut reader = Reader::new(fields);
        Self { log: reader.read_struct(ContractClassLog::deserialize), counter: reader.read_u32() }
    }
}

impl ContractClassLogData {
    pub fn scope(self, contract_address: AztecAddress) -> Scoped<Self> {
        Scoped { inner: self, contract_address }
    }
}

impl Ordered for Scoped<ContractClassLogData> {
    fn counter(self) -> u32 {
        self.inner.counter
    }
}

impl Scoped<ContractClassLogData> {
    pub fn expose_to_public(self) -> Self {
        Scoped {
            inner: ContractClassLogData { log: self.inner.log, counter: 0 },
            contract_address: self.contract_address,
        }
    }
}

#[test]
fn serialization_of_empty_contract_class_log() {
    let item = ContractClassLogData::empty();
    let serialized = item.serialize();
    let deserialized = ContractClassLogData::deserialize(serialized);
    assert(item.eq(deserialized));
}
