use dep::aztec::constants_gen;
struct StorageUpdateRequest{
    storage_slot : Field,
    old_value : Field,
    new_value : Field,
}

impl StorageUpdateRequest {
    fn hash(self) -> Field {
        let _hash_index = constants_gen::GENERATOR_INDEX__PUBLIC_DATA_UPDATE_REQUEST;
        0
    }
    
    fn is_empty(self) -> bool {
        self.storage_slot == 0
    }
}
