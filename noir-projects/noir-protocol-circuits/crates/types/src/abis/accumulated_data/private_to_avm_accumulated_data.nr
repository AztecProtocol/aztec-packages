use crate::{
    abis::side_effect::scoped::Scoped,
    constants::{
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        NUM_PRIVATE_TO_AVM_ACCUMULATED_DATA_ARRAYS, PRIVATE_TO_AVM_ACCUMULATED_DATA_LENGTH,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
    utils::{arrays::array_length, reader::Reader},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateToAvmAccumulatedData {
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [Scoped<L2ToL1Message>; MAX_L2_TO_L1_MSGS_PER_TX],
}

impl Empty for PrivateToAvmAccumulatedData {
    fn empty() -> Self {
        PrivateToAvmAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [Scoped::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
        }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateToAvmAccumulatedDataArrayLengths {
    pub note_hashes: u32,
    pub nullifiers: u32,
    pub l2_to_l1_msgs: u32,
}

impl PrivateToAvmAccumulatedDataArrayLengths {
    pub fn new(data: PrivateToAvmAccumulatedData) -> Self {
        PrivateToAvmAccumulatedDataArrayLengths {
            note_hashes: array_length(data.note_hashes),
            nullifiers: array_length(data.nullifiers),
            l2_to_l1_msgs: array_length(data.l2_to_l1_msgs),
        }
    }
}

impl Empty for PrivateToAvmAccumulatedDataArrayLengths {
    fn empty() -> Self {
        PrivateToAvmAccumulatedDataArrayLengths { note_hashes: 0, nullifiers: 0, l2_to_l1_msgs: 0 }
    }
}
