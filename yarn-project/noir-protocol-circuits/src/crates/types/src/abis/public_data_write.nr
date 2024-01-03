use crate::constants::GENERATOR_INDEX__PUBLIC_DATA_WRITE;

struct PublicDataWrite {
    leaf_slot : Field,
    old_value : Field,
    new_value : Field
}

impl PublicDataWrite {
    pub fn empty() -> Self {
        Self {
            leaf_slot : 0,
            old_value : 0,
            new_value : 0
        }
    }

    pub fn eq(self, write: PublicDataWrite) -> bool {
        (write.leaf_slot == self.leaf_slot) & (write.old_value == self.old_value) 
            & (write.new_value == self.new_value)
    }

    pub fn hash(self) -> Field {
        dep::std::hash::pedersen_hash_with_separator([
            self.leaf_slot,
            self.old_value,
            self.new_value
        ], GENERATOR_INDEX__PUBLIC_DATA_WRITE)
    }

    pub fn is_empty(self) -> bool {
        (self.leaf_slot == 0) & (self.old_value == 0) & (self.new_value == 0)
    }
}
