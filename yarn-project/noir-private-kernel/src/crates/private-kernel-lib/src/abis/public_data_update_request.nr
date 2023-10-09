use dep::aztec::constants_gen;

struct PublicDataUpdateRequest {
    leaf_index : Field,
    old_value : Field,
    new_value : Field
}

impl PublicDataUpdateRequest {
    fn hash(self) -> Field {
        let _hash_index = constants_gen::GENERATOR_INDEX__PUBLIC_DATA_UPDATE_REQUEST;
        0
    }

    // TODO(David): explain why we don't check other fields
    fn is_empty(self) -> bool {
        self.leaf_index == 0 
    }
}
