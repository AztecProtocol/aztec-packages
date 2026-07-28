use std::meta::derive;
use types::{
    constants::MAX_L1_TO_L2_MSGS_PER_BLOCK,
    traits::{Deserialize, Empty, Serialize},
};

/// A block's L1-to-L2 message bundle: the leaves it inserts into the L1-to-L2 message tree, plus the counts a block
/// root needs to append them and absorb them into the message sponge.
///
/// It carries two counts on purpose. Transitionally the L1-to-L2 tree insert is a fixed padded subtree while the
/// message sponge (and the checkpoint's `InboxParity` proof) work at the real message count, so the two differ:
/// - `num_msgs` — leaves appended to the tree (the padded subtree size for a message-bearing block, 0 for an empty
///   one).
/// - `num_real_msgs` — real (non-padding) messages absorbed into the message sponge.
///
/// Once the L1-to-L2 tree insert becomes real-count too (the Fast Inbox flip), `num_msgs == num_real_msgs` and
/// `num_real_msgs` is dropped, leaving this struct otherwise unchanged.
#[derive(Deserialize, Eq, Serialize)]
pub struct L1ToL2MessageBundle {
    pub messages: [Field; MAX_L1_TO_L2_MSGS_PER_BLOCK],
    pub num_msgs: u32,
    pub num_real_msgs: u32,
}

impl Empty for L1ToL2MessageBundle {
    fn empty() -> Self {
        L1ToL2MessageBundle { messages: [0; MAX_L1_TO_L2_MSGS_PER_BLOCK], num_msgs: 0, num_real_msgs: 0 }
    }
}
