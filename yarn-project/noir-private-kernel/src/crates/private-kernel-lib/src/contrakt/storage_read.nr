use dep::aztec::constants_gen;

struct StorageRead{
    storage_slot : Field,
    current_value : Field,
}

impl StorageRead {
    fn hash(self) -> Field {
        let _hash_index = constants_gen::GENERATOR_INDEX__PUBLIC_DATA_READ;
        0
    }

    fn is_empty(self) -> bool {
        self.storage_slot == 0
    }
}
