use crate::{
    abis::{public_data_write::PublicDataWrite, public_log::PublicLog},
    constants::{
        AVM_ACCUMULATED_DATA_LENGTH, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PUBLIC_LOGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct AvmAccumulatedData {
    // The note hashes from private combining with those made in the AVM execution.
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    // The nullifiers from private combining with those made in the AVM execution.
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    // The L2 to L1 messages from private combining with those made in the AVM execution.
    pub l2_to_l1_msgs: [ScopedL2ToL1Message; MAX_L2_TO_L1_MSGS_PER_TX],
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
            l2_to_l1_msgs: [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            public_logs: [PublicLog::empty(); MAX_PUBLIC_LOGS_PER_TX],
            public_data_writes: [
                PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
            ],
        }
    }
}

mod test {
    use crate::{
        abis::accumulated_data::avm_accumulated_data::AvmAccumulatedData,
        constants::AVM_ACCUMULATED_DATA_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_avm_accumulated_data() {
        let item = AvmAccumulatedData::empty();
        // We use the AVM_ACCUMULATED_DATA_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; AVM_ACCUMULATED_DATA_LENGTH] = item.serialize();
        let deserialized = AvmAccumulatedData::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
