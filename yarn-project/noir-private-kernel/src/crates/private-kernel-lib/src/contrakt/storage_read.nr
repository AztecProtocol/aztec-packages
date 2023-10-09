use crate::constants;

struct StorageRead{
    storage_slot : Field,
    current_value : Field,
}

impl StorageRead {
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::PUBLIC_DATA_READ;
        0
    }

    fn is_empty(self) -> bool {
        self.storage_slot == 0
    }
}