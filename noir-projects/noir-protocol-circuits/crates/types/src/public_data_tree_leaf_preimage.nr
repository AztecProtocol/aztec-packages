use crate::traits::Hash;
use dep::std::default::Default;
use crate::traits::is_default;

struct PublicDataTreeLeafPreimage {
    slot : Field,
    value: Field,
    next_slot :Field,
    next_index : u64,
}

impl Eq for PublicDataTreeLeafPreimage {
    fn eq(self, public_data_tree_leaf_preimage: PublicDataTreeLeafPreimage) -> bool {
        (public_data_tree_leaf_preimage.slot == self.slot)
        & (public_data_tree_leaf_preimage.value == self.value)
        & (public_data_tree_leaf_preimage.next_slot == self.next_slot)
        & (public_data_tree_leaf_preimage.next_index == self.next_index)
    }
}

impl Default for PublicDataTreeLeafPreimage {
    fn default() -> Self {
        Self {
            slot: 0,
            value: 0,
            next_slot: 0,
            next_index: 0,
        }
    }
}

impl Hash for PublicDataTreeLeafPreimage {
    fn hash(self) -> Field {
        if is_default(self) {
            0
        } else {
            dep::std::hash::pedersen_hash([self.slot, self.value, (self.next_index as Field), self.next_slot])
        }
    }
}
