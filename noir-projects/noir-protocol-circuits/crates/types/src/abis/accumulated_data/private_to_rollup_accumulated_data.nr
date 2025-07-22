use crate::{
    abis::{log_hash::LogHash, private_log::PrivateLog, side_effect::scoped::Scoped},
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX, PRIVATE_TO_ROLLUP_ACCUMULATED_DATA_LENGTH,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateToRollupAccumulatedData {
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [Scoped<L2ToL1Message>; MAX_L2_TO_L1_MSGS_PER_TX],
    pub private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    pub contract_class_logs_hashes: [Scoped<LogHash>; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

impl Empty for PrivateToRollupAccumulatedData {
    fn empty() -> Self {
        PrivateToRollupAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [Scoped::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            contract_class_logs_hashes: [Scoped::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
        }
    }
}

#[test]
fn test_private_to_rollup_accumulated_data_serialization() {
    let item = PrivateToRollupAccumulatedData {
        note_hashes: [123; MAX_NOTE_HASHES_PER_TX],
        nullifiers: [456; MAX_NULLIFIERS_PER_TX],
        l2_to_l1_msgs: [Scoped::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
        private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
        contract_class_logs_hashes: [Scoped::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
    };

    // We use the PRIVATE_TO_ROLLUP_ACCUMULATED_DATA_LENGTH constant to ensure that there is a match
    // between the derived trait implementation and the constant
    let serialized: [Field; PRIVATE_TO_ROLLUP_ACCUMULATED_DATA_LENGTH] = item.serialize();
    let deserialized = PrivateToRollupAccumulatedData::deserialize(serialized);
    assert(item.eq(deserialized));
}
