use std::meta::derive;
use types::{constants::MAX_L1_TO_L2_MSGS_PER_BLOCK, traits::{Deserialize, Empty, Serialize}};

/// A block's L1-to-L2 message bundle: the real message leaves it inserts into the L1-to-L2 message tree, which of
/// those leaves open an L1 Inbox bucket, and the count a block root needs to append them and absorb them into the
/// message sponge.
///
/// The `num_msgs` real messages occupy the leading lanes; the same count drives both the compact (unpadded) tree
/// append and the message-sponge absorb, matching the checkpoint's variable-size `InboxParity` proof. Lanes past
/// `num_msgs` are zero padding and claim no bucket start.
#[derive(Deserialize, Eq, Serialize)]
pub struct L1ToL2MessageBundle {
    pub messages: [Field; MAX_L1_TO_L2_MSGS_PER_BLOCK],
    /// Per-lane flag marking the leaves that are the first message of an L1 bucket. A block consumes whole buckets,
    /// so lane 0 is a start whenever `num_msgs > 0`; false beyond `num_msgs`.
    pub bucket_starts: [bool; MAX_L1_TO_L2_MSGS_PER_BLOCK],
    pub num_msgs: u32,
}

impl Empty for L1ToL2MessageBundle {
    fn empty() -> Self {
        L1ToL2MessageBundle {
            messages: [0; MAX_L1_TO_L2_MSGS_PER_BLOCK],
            bucket_starts: [false; MAX_L1_TO_L2_MSGS_PER_BLOCK],
            num_msgs: 0,
        }
    }
}
