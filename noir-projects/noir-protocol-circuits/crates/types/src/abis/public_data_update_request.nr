use crate::constants::GENERATOR_INDEX__PUBLIC_DATA_UPDATE_REQUEST;
use dep::std::cmp::Eq;
use dep::std::default::Default;
use crate::traits::Hash;

struct PublicDataUpdateRequest {
    leaf_slot : Field,
    new_value : Field
}

impl Eq for PublicDataUpdateRequest {
    fn eq(self, update_request: PublicDataUpdateRequest) -> bool {
        (update_request.leaf_slot == self.leaf_slot)
            & (update_request.new_value == self.new_value)
    }
}

impl Default for PublicDataUpdateRequest {
    fn default() -> Self {
        Self {
            leaf_slot : 0,
            new_value : 0
        }
    }
}

impl Hash for PublicDataUpdateRequest {
    fn hash(self) -> Field {
        dep::std::hash::pedersen_hash_with_separator([
            self.leaf_slot,
            self.new_value
        ], GENERATOR_INDEX__PUBLIC_DATA_UPDATE_REQUEST)
    }
}
