use crate::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PartialStateReference {
    pub note_hash_tree: AppendOnlyTreeSnapshot,
    pub nullifier_tree: AppendOnlyTreeSnapshot,
    pub public_data_tree: AppendOnlyTreeSnapshot,
}

impl Empty for PartialStateReference {
    fn empty() -> Self {
        Self {
            note_hash_tree: AppendOnlyTreeSnapshot::empty(),
            nullifier_tree: AppendOnlyTreeSnapshot::empty(),
            public_data_tree: AppendOnlyTreeSnapshot::empty(),
        }
    }
}

mod test {
    use crate::{
        abis::partial_state_reference::PartialStateReference,
        constants::PARTIAL_STATE_REFERENCE_LENGTH,
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
