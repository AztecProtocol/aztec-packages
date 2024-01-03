use crate::{
    constants::{
        STORAGE_WRITE_LENGTH,
        GENERATOR_INDEX__PUBLIC_DATA_WRITE,
    },
    hash::pedersen_hash,
};

struct StorageWrite{
    storage_slot : Field,
    old_value : Field,
    new_value : Field,
}

impl StorageWrite {
    pub fn empty() -> Self {
        StorageWrite {
            storage_slot: 0,
            old_value: 0,
            new_value: 0,
        }
    }

    pub fn serialize(self) -> [Field; STORAGE_WRITE_LENGTH] {
        [self.storage_slot, self.old_value, self.new_value]
    }

    pub fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__PUBLIC_DATA_WRITE)
    }

    pub fn is_empty(self) -> bool {
        self.storage_slot == 0
    }

    pub fn eq(self, request: Self) -> bool {
        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/3595)
        (request.storage_slot == self.storage_slot)
            & (request.old_value == self.old_value)
            & (request.new_value == self.new_value)
    }
}
