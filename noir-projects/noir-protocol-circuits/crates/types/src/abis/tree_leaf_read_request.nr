use crate::{constants::TREE_LEAF_READ_REQUEST_LENGTH, traits::{Deserialize, Empty, Serialize}};

pub struct TreeLeafReadRequest {
    value: Field,
    leaf_index: Field,
}

impl Eq for TreeLeafReadRequest {
    fn eq(self, other: TreeLeafReadRequest) -> bool {
        (self.value == other.value) & (self.leaf_index == other.leaf_index)
    }
}

impl Empty for TreeLeafReadRequest {
    fn empty() -> Self {
        TreeLeafReadRequest { value: 0, leaf_index: 0 }
    }
}

impl Serialize<TREE_LEAF_READ_REQUEST_LENGTH> for TreeLeafReadRequest {
    fn serialize(self) -> [Field; TREE_LEAF_READ_REQUEST_LENGTH] {
        [self.value, self.leaf_index]
    }
}

impl Deserialize<TREE_LEAF_READ_REQUEST_LENGTH> for TreeLeafReadRequest {
    fn deserialize(values: [Field; TREE_LEAF_READ_REQUEST_LENGTH]) -> Self {
        Self { value: values[0], leaf_index: values[1] }
    }
}

#[test]
fn serialization_of_empty_read() {
    let item = TreeLeafReadRequest::empty();
    let serialized = item.serialize();
    let deserialized = TreeLeafReadRequest::deserialize(serialized);
    assert(item.eq(deserialized));
}
