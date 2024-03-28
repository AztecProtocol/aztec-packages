global NULLIFIER_LEAF_PREIMAGE_LENGTH: u64 = 3;

use crate::{merkle_tree::leaf_preimage::{LeafPreimage, IndexedTreeLeafPreimage}, traits::{is_default, Hash}};

struct NullifierLeafPreimage {
    nullifier : Field,
    next_nullifier :Field,
    next_index : u64,
}

impl Eq for NullifierLeafPreimage {
    fn eq(self, nullifier_leaf_preimage: NullifierLeafPreimage) -> bool {
        (nullifier_leaf_preimage.nullifier == self.nullifier)
            & (nullifier_leaf_preimage.next_nullifier == self.next_nullifier)
            & (nullifier_leaf_preimage.next_index == self.next_index)
    }
}

impl Default for NullifierLeafPreimage {
    fn default() -> Self {
        Self {
            nullifier : 0,
            next_nullifier : 0,
            next_index : 0,
        }
    }
}

impl Hash for NullifierLeafPreimage {
    fn hash(self) -> Field {
        if is_default(self) {
            0
        } else {
            dep::std::hash::pedersen_hash(self.serialize())
        }
    }
}

impl LeafPreimage for NullifierLeafPreimage {
    fn get_key(self) -> Field {
        self.nullifier
    }

    fn as_leaf(self) -> Field {
        self.hash()
    }
}

impl IndexedTreeLeafPreimage for NullifierLeafPreimage {
    fn get_key(self) -> Field {
        self.nullifier
    }

    fn get_next_key(self) -> Field {
        self.next_nullifier
    }

    fn as_leaf(self) -> Field {
        self.hash()
    }
}

impl NullifierLeafPreimage {
    pub fn serialize(self) -> [Field; NULLIFIER_LEAF_PREIMAGE_LENGTH] {
        [self.nullifier, self.next_nullifier, self.next_index as Field]
    }

    pub fn deserialize(fields: [Field; NULLIFIER_LEAF_PREIMAGE_LENGTH]) -> Self {
        Self { nullifier: fields[0], next_nullifier: fields[1], next_index: fields[2] as u64 }
    }
}
