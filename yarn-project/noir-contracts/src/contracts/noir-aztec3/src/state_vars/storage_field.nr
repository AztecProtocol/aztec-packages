use crate::notes::value_note::Note;
use crate::types::point::Point;

#[oracle(storageRead)]
fn storage_read_oracle(
    _storage_slot: Field,
) -> [Field; 1] {}

unconstrained fn storage_read(
    storage_slot: Field,
) -> [Field; 1] {
    storage_read_oracle(storage_slot)
}


#[oracle(storageWrite)]
fn storage_write_oracle(
    _storage_slot: Field,
    _value: Field,
) -> [Field; 1] {}

unconstrained fn storage_write(
    storage_slot: Field,
    value: Field,
) -> [Field; 1] {
    storage_write_oracle(storage_slot, value)
}

struct StorageField {
    storage_slot: Field,
}

impl StorageField {
    fn new(storage_slot: Field) -> StorageField {
        StorageField { storage_slot }
    }

    fn read(self) -> Field {
        storage_read(self.storage_slot)[0]
    }

    fn write(self, value: Field) -> Field {
        storage_write(self.storage_slot, value)[0]
    }
}
