use crate::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    partial_state_reference::PartialStateReference,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Serialize)]
pub struct StateReference {
    pub l1_to_l2_message_tree: AppendOnlyTreeSnapshot,
    pub partial: PartialStateReference,
}

impl Empty for StateReference {
    fn empty() -> Self {
        Self {
            l1_to_l2_message_tree: AppendOnlyTreeSnapshot::zero(),
            partial: PartialStateReference::empty(),
        }
    }
}

// TODO(benesjan): why does deriving Eq not work?
impl Eq for StateReference {
    fn eq(self, other: StateReference) -> bool {
        self.l1_to_l2_message_tree.eq(other.l1_to_l2_message_tree) & self.partial.eq(other.partial)
    }
}

mod test {
    use crate::{
        constants::STATE_REFERENCE_LENGTH,
        state_reference::StateReference,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let state = StateReference::empty();

        // We use the STATE_REFERENCE_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; STATE_REFERENCE_LENGTH] = state.serialize();
        let deserialized = StateReference::deserialize(serialized);

        assert_eq(state, deserialized);
    }
}
