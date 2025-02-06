use crate::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct TreeSnapshots {
    pub l1_to_l2_message_tree: AppendOnlyTreeSnapshot,
    pub note_hash_tree: AppendOnlyTreeSnapshot,
    pub nullifier_tree: AppendOnlyTreeSnapshot,
    pub public_data_tree: AppendOnlyTreeSnapshot,
}

impl Empty for TreeSnapshots {
    fn empty() -> Self {
        Self {
            l1_to_l2_message_tree: AppendOnlyTreeSnapshot::zero(),
            note_hash_tree: AppendOnlyTreeSnapshot::zero(),
            nullifier_tree: AppendOnlyTreeSnapshot::zero(),
            public_data_tree: AppendOnlyTreeSnapshot::zero(),
        }
    }
}

mod test {
    use crate::{
        abis::tree_snapshots::TreeSnapshots,
        constants::TREE_SNAPSHOTS_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_tree_snapshots() {
        let item = TreeSnapshots::empty();
        // We use the TREE_SNAPSHOTS_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; TREE_SNAPSHOTS_LENGTH] = item.serialize();
        let deserialized = TreeSnapshots::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
