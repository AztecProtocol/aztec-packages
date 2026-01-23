use crate::{merkle_tree::leaf_preimage::{IndexedTreeLeafPreimage, LeafPreimage}, traits::Empty};
use std::hash::pedersen_hash;

pub struct TestLeafPreimage {
    pub value: Field,
    pub next_value: Field,
}

impl Empty for TestLeafPreimage {
    fn empty() -> Self {
        TestLeafPreimage { value: 0, next_value: 0 }
    }
}

impl LeafPreimage for TestLeafPreimage {
    fn get_key(self) -> Field {
        self.value
    }

    fn as_leaf(self) -> Field {
        pedersen_hash([self.value])
    }
}

impl Eq for TestLeafPreimage {
    fn eq(self, other: Self) -> bool {
        (self.value == other.value) & (self.next_value == other.next_value)
    }
}

impl IndexedTreeLeafPreimage<Field> for TestLeafPreimage {
    fn get_next_key(self) -> Field {
        self.next_value
    }

    fn points_to_infinity(self) -> bool {
        (self.next_value == 0)
    }

    fn update_pointers(self, next_value: Field, _next_index: Field) -> Self {
        Self { value: self.value, next_value }
    }

    fn update_value(self, value: Field) -> Self {
        Self { value, next_value: self.next_value }
    }

    fn build_insertion_leaf(value: Field, low_leaf: Self) -> Self {
        Self { value, next_value: low_leaf.next_value }
    }
}
