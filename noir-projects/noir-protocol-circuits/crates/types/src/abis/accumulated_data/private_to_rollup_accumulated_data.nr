use crate::{
    abis::{log_hash::ScopedLogHash, private_log::PrivateLog},
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
    pub contract_class_logs_hashes: [ScopedLogHash; MAX_CONTRACT_CLASS_LOGS_PER_TX],

    // Here so that the gas cost of this request can be measured by circuits, without actually needing to feed in the
    // variable-length data.
    pub contract_class_log_preimages_length: Field,
}

impl Empty for PrivateToRollupAccumulatedData {
    fn empty() -> Self {
        PrivateToRollupAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            contract_class_logs_hashes: [ScopedLogHash::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
            contract_class_log_preimages_length: 0,
        }
    }
}

mod test {
    use crate::{
        abis::accumulated_data::private_to_rollup_accumulated_data::PrivateToRollupAccumulatedData,
        constants::PRIVATE_TO_ROLLUP_ACCUMULATED_DATA_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_private_to_rollup_accumulated_data() {
        let item = PrivateToRollupAccumulatedData::empty();
        // We use the PRIVATE_TO_ROLLUP_ACCUMULATED_DATA_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; PRIVATE_TO_ROLLUP_ACCUMULATED_DATA_LENGTH] = item.serialize();
        let deserialized = PrivateToRollupAccumulatedData::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
