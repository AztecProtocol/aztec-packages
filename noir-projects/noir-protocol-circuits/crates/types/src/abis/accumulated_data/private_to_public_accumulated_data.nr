use crate::{
    abis::{
        log_hash::LogHash, private_log::PrivateLog, public_call_request::PublicCallRequest,
        side_effect::scoped::Scoped,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
};
use crate::constants::{
    MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
    MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateToPublicAccumulatedData {
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [Scoped<L2ToL1Message>; MAX_L2_TO_L1_MSGS_PER_TX],
    pub private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    pub contract_class_logs_hashes: [Scoped<LogHash>; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    pub public_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
}

impl Empty for PrivateToPublicAccumulatedData {
    fn empty() -> Self {
        PrivateToPublicAccumulatedData {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [Scoped::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            contract_class_logs_hashes: [Scoped::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
            public_call_requests: [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
        }
    }
}

mod test {
    use crate::{
        abis::accumulated_data::private_to_public_accumulated_data::PrivateToPublicAccumulatedData,
        constants::PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_private_to_public_accumulated_data() {
        let item = PrivateToPublicAccumulatedData::empty();
        // We use the PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; PRIVATE_TO_PUBLIC_ACCUMULATED_DATA_LENGTH] = item.serialize();
        let deserialized = PrivateToPublicAccumulatedData::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
