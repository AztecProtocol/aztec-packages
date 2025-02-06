use crate::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Serialize)]
pub struct PartialStateReference {
    pub note_hash_tree: AppendOnlyTreeSnapshot,
    pub nullifier_tree: AppendOnlyTreeSnapshot,
    pub public_data_tree: AppendOnlyTreeSnapshot,
}

impl Empty for PartialStateReference {
    fn empty() -> Self {
        Self {
            note_hash_tree: AppendOnlyTreeSnapshot::zero(),
            nullifier_tree: AppendOnlyTreeSnapshot::zero(),
            public_data_tree: AppendOnlyTreeSnapshot::zero(),
        }
    }
}

// TODO(benesjan): why does deriving Eq not work?
impl Eq for PartialStateReference {
    fn eq(self, other: PartialStateReference) -> bool {
        self.note_hash_tree.eq(other.note_hash_tree)
            & self.nullifier_tree.eq(other.nullifier_tree)
            & self.public_data_tree.eq(other.public_data_tree)
    }
}

mod test {
    use crate::{
        constants::PARTIAL_STATE_REFERENCE_LENGTH,
        partial_state_reference::PartialStateReference,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let empty = PartialStateReference::empty();

        // We use the PARTIAL_STATE_REFERENCE_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; PARTIAL_STATE_REFERENCE_LENGTH] = empty.serialize();

        let deserialized = PartialStateReference::deserialize(serialized);

        assert(empty.eq(deserialized));
    }

}
