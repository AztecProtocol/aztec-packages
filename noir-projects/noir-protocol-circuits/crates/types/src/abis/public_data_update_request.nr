use dep::std::cmp::Eq;
use crate::traits::{Empty, Hash};

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

impl Empty for PublicDataUpdateRequest {
    fn empty() -> Self {
        Self {
            leaf_slot : 0,
            new_value : 0
        }
    }
}

impl Hash for PublicDataUpdateRequest {
    fn hash(self) -> Field {
        crate::hash::poseidon_hash([
            self.leaf_slot,
            self.new_value
        ])
    }
}

impl PublicDataUpdateRequest {
    pub fn is_empty(self) -> bool {
        (self.leaf_slot == 0) & (self.new_value == 0)
    }
}
