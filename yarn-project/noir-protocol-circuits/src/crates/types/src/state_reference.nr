use crate::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;
use crate::partial_state_reference::PartialStateReference;

struct StateReference {
    l1_to_l2_message_tree: AppendOnlyTreeSnapshot,
    partial: PartialStateReference,
}

global STATE_REFERENCE_LENGTH: Field = 10; // 2 for snap + 8 for partial

impl StateReference {
    fn eq(self, other: StateReference) -> bool {
        self.l1_to_l2_message_tree.eq(other.l1_to_l2_message_tree) &
        self.partial.eq(other.partial)
    }

    fn serialize(self) -> [Field; STATE_REFERENCE_LENGTH] {
        let serialized_l1_to_l2_message_tree = self.l1_to_l2_message_tree.serialize();
        let serialized_partial = self.partial.serialize();

        [
            serialized_l1_to_l2_message_tree[0],
            serialized_l1_to_l2_message_tree[1],
            serialized_partial[0],
            serialized_partial[1],
            serialized_partial[2],
            serialized_partial[3],
            serialized_partial[4],
            serialized_partial[5],
            serialized_partial[6],
            serialized_partial[7],
        ]
    }

    fn deserialize(serialized: [Field; STATE_REFERENCE_LENGTH]) -> StateReference {
        StateReference {
            l1_to_l2_message_tree: AppendOnlyTreeSnapshot::deserialize(
                [serialized[0], serialized[1]]
            ),
            partial: PartialStateReference::deserialize(
                [serialized[2], serialized[3], serialized[4], serialized[5],
                 serialized[6], serialized[7], serialized[8], serialized[9]]
            ),
        }
    }
}
