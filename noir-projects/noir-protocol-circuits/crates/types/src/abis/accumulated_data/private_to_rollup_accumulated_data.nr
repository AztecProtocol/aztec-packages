use crate::{
    abis::{log_hash::LogHash, private_log::PrivateLog, side_effect::scoped::Scoped},
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateToRollupAccumulatedData {
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [ScopedL2ToL1Message; MAX_L2_TO_L1_MSGS_PER_TX],
    pub private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    pub contract_class_logs_hashes: [Scoped<LogHash>; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

impl Empty for PrivateToRollupAccumulatedData {
    fn empty() -> Self {
        PrivateToRollupAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            contract_class_logs_hashes: [Scoped::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
        }
    }
}

#[test]
fn serialization_of_empty() {
    let item = PrivateToRollupAccumulatedData::empty();
    let serialized = item.serialize();
    let deserialized = PrivateToRollupAccumulatedData::deserialize(serialized);
    assert(item.eq(deserialized));
}
