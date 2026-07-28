use std::meta::derive;
use types::{
    constants::MAX_L1_TO_L2_MSGS_PER_BLOCK,
    traits::{Deserialize, Empty, Serialize},
};

/// A block's L1-to-L2 message bundle: the real message leaves it inserts into the L1-to-L2 message tree, and the
/// count a block root needs to append them and absorb them into the message sponge (AZIP-22 Fast Inbox).
///
/// The `num_msgs` real messages occupy the leading lanes; the same count drives both the compact (unpadded) tree
/// append and the message-sponge absorb, matching the checkpoint's variable-size `InboxParity` proof. Lanes past
/// `num_msgs` are zero padding.
#[derive(Deserialize, Eq, Serialize)]
pub struct L1ToL2MessageBundle {
    pub messages: [Field; MAX_L1_TO_L2_MSGS_PER_BLOCK],
    pub num_msgs: u32,
}

impl Empty for L1ToL2MessageBundle {
    fn empty() -> Self {
        L1ToL2MessageBundle { messages: [0; MAX_L1_TO_L2_MSGS_PER_BLOCK], num_msgs: 0 }
    }
}
