use crate::{constants::APPEND_ONLY_TREE_SNAPSHOT_LENGTH, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct AppendOnlyTreeSnapshot {
    pub root: Field,
    // TODO(Alvaro) change this to a u64
    pub next_available_leaf_index: u32,
}

impl Empty for AppendOnlyTreeSnapshot {
    fn empty() -> Self {
        Self { root: 0, next_available_leaf_index: 0 }
    }
}

#[test]
fn test_append_only_tree_snapshot_serialization() {
    let item = AppendOnlyTreeSnapshot { root: 123, next_available_leaf_index: 456 };

    // We use the APPEND_ONLY_TREE_SNAPSHOT_LENGTH constant to ensure that there is a match
    // between the derived trait implementation and the constant
    let serialized: [Field; APPEND_ONLY_TREE_SNAPSHOT_LENGTH] = item.serialize();
    let deserialized = AppendOnlyTreeSnapshot::deserialize(serialized);
    assert(item.eq(deserialized));
}
