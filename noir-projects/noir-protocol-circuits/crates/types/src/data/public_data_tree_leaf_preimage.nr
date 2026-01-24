use crate::{
    data::public_data_tree_leaf::PublicDataTreeLeaf,
    merkle_tree::{IndexedTreeLeafPreimage, LeafPreimage},
    traits::{Deserialize, Empty, Hash, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicDataTreeLeafPreimage {
    pub slot: Field,
    pub value: Field,
    pub next_slot: Field,
    pub next_index: Field,
}

/// An empty public data tree leaf preimage never actually exists in the tree.
///
/// Unlike the nullifier tree, where nullifiers are inserted in fixed-size batches (padded with empty preimages when
/// a transaction doesn't fill a full batch), the AVM inserts public data leaves one by one, so no padding is needed.
///
/// The tree is initialized with non-empty leaf preimages (see table below). To insert an empty leaf preimage
/// (slot = 0), we would need to find a valid low leaf satisfying: low_leaf.slot < 0 < low_leaf.next_slot.
/// Since all slots in the tree are non-negative, no such low leaf exists, making insertion impossible.
///
/// In fact, slot 0 already exists in the initial tree state. The preimage { slot: 0, value: 0, next_slot: 1,
/// next_index: 1 } can be used to prove membership and update the value at slot 0. However, it's practically
/// impossible for a contract to produce a storage slot where `compute_public_data_leaf_slot` returns 0.
///
/// Note: Tree leaves beyond next_available_leaf_index contain zero hashes (the default empty leaf value in Merkle
/// trees). These are NOT hashes of empty leaf preimages - the hash of an empty public data leaf preimage is
/// 0x20be000d93b852c82d4e02c94e9e61fa3a0e79949aac3af4010620651d416134
///
/// Initial state of the Public Data Tree (initialized in content_addressed_indexed_tree.hpp with N = 128):
///
///   Index |  slot    value   next_index  next_slot
///   ----- |  ----    -----   ----------  ---------
///   0     |  0       0       1           1
///   1     |  1       0       2           2
///   2     |  2       0       3           3
///   ...   |  ...     ...     ...         ...
///   N-2   |  N-2     0       N-1         N-1
///   N-1   |  N-1     0       0           0          (points to infinity)
///
impl Empty for PublicDataTreeLeafPreimage {
    fn empty() -> Self {
        Self { slot: 0, value: 0, next_slot: 0, next_index: 0 }
    }
}

impl Hash for PublicDataTreeLeafPreimage {
    fn hash(self) -> Field {
        // The order must match what's defined in the cpp merkle tree implementation:
        // `merkle_tree/indexed_tree/indexed_leaf.hpp` > PublicDataLeafValue > get_hash_inputs
        // TODO: Change this to crate::hash::poseidon2_hash(self.serialize()) and cpp to use the same order.
        crate::hash::poseidon2_hash([self.slot, self.value, self.next_index, self.next_slot])
    }
}

impl LeafPreimage for PublicDataTreeLeafPreimage {
    fn get_key(self) -> Field {
        self.slot
    }

    fn as_leaf(self) -> Field {
        self.hash()
    }
}

impl IndexedTreeLeafPreimage<PublicDataTreeLeaf> for PublicDataTreeLeafPreimage {
    fn get_next_key(self) -> Field {
        self.next_slot
    }

    fn points_to_infinity(self) -> bool {
        (self.next_slot == 0) & (self.next_index == 0)
    }

    fn update_pointers(self, next_slot: Field, next_index: Field) -> Self {
        Self { slot: self.slot, value: self.value, next_slot, next_index }
    }

    fn update_value(self, write: PublicDataTreeLeaf) -> Self {
        Self {
            slot: self.slot,
            value: write.value,
            next_slot: self.next_slot,
            next_index: self.next_index,
        }
    }

    fn build_insertion_leaf(write: PublicDataTreeLeaf, low_leaf: Self) -> Self {
        Self {
            slot: write.slot,
            value: write.value,
            next_slot: low_leaf.next_slot,
            next_index: low_leaf.next_index,
        }
    }
}
