use crate::messaging::l1_to_l2_message::L1_TO_L2_MESSAGE_LEN;
use crate::messaging::l1_to_l2_message::L1ToL2Message;
use crate::utils::arr_copy_slice;

struct CommitmentGetterData {
    message: Field,
    leaf_index: Field,
    root: Field,
}

fn commitment_message_getter_len() -> comptime Field {
    1 + 1 + 1
}

// TODO: 3 as const
fn make_commitment_getter_data(fields: [Field; 3], start: comptime Field) -> CommitmentGetterData {
    CommitmentGetterData {
        message: fields[start],
        leaf_index: fields[start + 1],
        root: fields[start + 2],
    }
}