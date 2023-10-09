use crate::constants;

struct PublicDataUpdateRequest {
    leaf_index : Field,
    old_value : Field,
    new_value : Field
}

impl PublicDataUpdateRequest {
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::PUBLIC_DATA_UPDATE_REQUEST;
        0
    }

    // TODO(David): explain why we don't check other fields
    fn is_empty(self) -> bool {
        self.leaf_index == 0 
    }
}