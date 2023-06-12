use crate::messaging::l1_to_l2_message::L1_TO_L2_MESSAGE_LEN;
use crate::messaging::l1_to_l2_message::L1ToL2Message;
use crate::utils::arr_copy_slice;

struct CommitmentGetterData {
    message: Field,
    sibling_path: [Field; crate::PRIVATE_DATA_TREE_HEIGHT],
    leaf_index: Field,
    root: Field,
}

fn commitment_message_getter_len() -> comptime Field {
    1 + 1 + crate::PRIVATE_DATA_TREE_HEIGHT + 1
}

// TODO: 11 as const
fn make_commitment_getter_data(fields: [Field; 11], start: comptime Field) -> CommitmentGetterData {
    CommitmentGetterData {
        message: fields[start],
        leaf_index: fields[1],
        sibling_path: arr_copy_slice(fields, [0; crate::PRIVATE_DATA_TREE_HEIGHT], 2),
        root: fields[start + 1 + 1 + crate::PRIVATE_DATA_TREE_HEIGHT],
    }
}