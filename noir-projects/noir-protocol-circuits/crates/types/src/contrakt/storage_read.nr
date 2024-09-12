use crate::{constants::CONTRACT_STORAGE_READ_LENGTH, traits::{Deserialize, Empty, Serialize}};

struct StorageRead {
    storage_slot: Field,
    current_value: Field,
    counter: u32,
}

impl Eq for StorageRead {
    fn eq(self, other: Self) -> bool {
        (self.storage_slot == other.storage_slot) & (self.current_value == other.current_value) & (self.current_value == other.current_value)
    }
}

impl Empty for StorageRead {
    fn empty() -> Self {
        Self {
            storage_slot: 0,
            current_value: 0,
            counter: 0,
        }
    }
}

impl Serialize<CONTRACT_STORAGE_READ_LENGTH> for StorageRead {
    fn serialize(self) -> [Field; CONTRACT_STORAGE_READ_LENGTH] {
        [self.storage_slot, self.current_value, self.counter as Field]
    }
}

impl Deserialize<CONTRACT_STORAGE_READ_LENGTH> for StorageRead {
    fn deserialize(serialized: [Field; CONTRACT_STORAGE_READ_LENGTH]) -> Self {
        Self {
            storage_slot: serialized[0],
            current_value: serialized[1],
            counter: serialized[2] as u32,
        }
    }
}

impl StorageRead {
    pub fn is_empty(self) -> bool {
        (self.storage_slot == 0) & (self.current_value == 0) & (self.counter == 0)
    }
}

#[test]
fn serialization_of_empty() {
    let item = StorageRead::empty();
    let serialized = item.serialize();
    let deserialized = StorageRead::deserialize(serialized);
    assert(item.eq(deserialized));
}
