use crate::{
    constants::{CONTRACT_STORAGE_READ_LENGTH, GENERATOR_INDEX__PUBLIC_DATA_READ}, hash::pedersen_hash,
    traits::{Deserialize, Hash, Serialize}
};
use dep::std::cmp::Eq;
use dep::std::default::Default;

struct StorageRead {
    storage_slot: Field,
    current_value: Field,
}

impl Eq for StorageRead {
    fn eq(self, other: Self) -> bool {
        (self.storage_slot == other.storage_slot) & (self.current_value == other.current_value)
    }
}

impl Default for StorageRead {   
    fn default() -> Self {
        Self {
            storage_slot: 0,
            current_value: 0,
        }
    }
}

impl Hash for StorageRead {
    fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__PUBLIC_DATA_READ)
    }
}

impl Serialize<CONTRACT_STORAGE_READ_LENGTH> for StorageRead {
    fn serialize(self) -> [Field; CONTRACT_STORAGE_READ_LENGTH] {
        [self.storage_slot, self.current_value]
    }
}

impl Deserialize<CONTRACT_STORAGE_READ_LENGTH> for StorageRead {
    fn deserialize(serialized: [Field; CONTRACT_STORAGE_READ_LENGTH]) -> Self {
        Self {
            storage_slot: serialized[0],
            current_value: serialized[1],
        }
    }
}

