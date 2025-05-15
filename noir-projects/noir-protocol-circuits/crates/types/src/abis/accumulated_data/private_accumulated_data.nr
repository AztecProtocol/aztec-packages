use crate::{
    abis::{
        log_hash::LogHash,
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_call_request::PrivateCallRequest,
        private_log::PrivateLogData,
        public_call_request::PublicCallRequest,
        side_effect::{Counted, scoped::Scoped},
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
};
use crate::constants::{
    MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
    MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
    MAX_PRIVATE_LOGS_PER_TX,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateAccumulatedData {
    pub note_hashes: [ScopedNoteHash; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [ScopedNullifier; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [ScopedL2ToL1Message; MAX_L2_TO_L1_MSGS_PER_TX],

    pub private_logs: [Scoped<PrivateLogData>; MAX_PRIVATE_LOGS_PER_TX],
    pub contract_class_logs_hashes: [Scoped<Counted<LogHash>>; MAX_CONTRACT_CLASS_LOGS_PER_TX],

    pub public_call_requests: [Counted<PublicCallRequest>; MAX_ENQUEUED_CALLS_PER_TX],
    pub private_call_stack: [PrivateCallRequest; MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX],
}

impl Empty for PrivateAccumulatedData {
    fn empty() -> Self {
        PrivateAccumulatedData {
            note_hashes: [ScopedNoteHash::empty(); MAX_NOTE_HASHES_PER_TX],
            nullifiers: [ScopedNullifier::empty(); MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            private_logs: [Scoped::empty(); MAX_PRIVATE_LOGS_PER_TX],
            contract_class_logs_hashes: [Scoped::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
            public_call_requests: [Counted::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            private_call_stack: [PrivateCallRequest::empty(); MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX],
        }
    }
}

mod test {
    use crate::{
        abis::accumulated_data::private_accumulated_data::PrivateAccumulatedData,
        constants::PRIVATE_ACCUMULATED_DATA_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_private_accumulated_data() {
        let item = PrivateAccumulatedData::empty();
        // We use the PRIVATE_ACCUMULATED_DATA_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; PRIVATE_ACCUMULATED_DATA_LENGTH] = item.serialize();
        let deserialized = PrivateAccumulatedData::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
