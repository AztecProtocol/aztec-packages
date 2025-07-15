use crate::{
    abis::{public_data_write::PublicDataWrite, public_log::PublicLog, side_effect::scoped::Scoped},
    constants::{
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PUBLIC_LOGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
    utils::arrays::array_length,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct AvmAccumulatedData {
    // The note hashes from private combining with those made in the AVM execution.
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    // The nullifiers from private combining with those made in the AVM execution.
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    // The L2 to L1 messages from private combining with those made in the AVM execution.
    pub l2_to_l1_msgs: [Scoped<L2ToL1Message>; MAX_L2_TO_L1_MSGS_PER_TX],
    // The public logs emitted from the AVM execution.
    pub public_logs: [PublicLog; MAX_PUBLIC_LOGS_PER_TX],
    // The public data writes made in the AVM execution.
    pub public_data_writes: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
}

impl Empty for AvmAccumulatedData {
    fn empty() -> Self {
        AvmAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [Scoped::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            public_logs: [PublicLog::empty(); MAX_PUBLIC_LOGS_PER_TX],
            public_data_writes: [
                PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
            ],
        }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct AvmAccumulatedDataArrayLengths {
    pub note_hashes: u32,
    pub nullifiers: u32,
    pub l2_to_l1_msgs: u32,
    pub public_logs: u32,
    pub public_data_writes: u32,
}

impl AvmAccumulatedDataArrayLengths {
    pub fn new(data: AvmAccumulatedData) -> Self {
        AvmAccumulatedDataArrayLengths {
            note_hashes: array_length(data.note_hashes),
            nullifiers: array_length(data.nullifiers),
            l2_to_l1_msgs: array_length(data.l2_to_l1_msgs),
            public_logs: array_length(data.public_logs),
            public_data_writes: array_length(data.public_data_writes),
        }
    }
}

impl Empty for AvmAccumulatedDataArrayLengths {
    fn empty() -> Self {
        AvmAccumulatedDataArrayLengths {
            note_hashes: 0,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            public_logs: 0,
            public_data_writes: 0,
        }
    }
}
