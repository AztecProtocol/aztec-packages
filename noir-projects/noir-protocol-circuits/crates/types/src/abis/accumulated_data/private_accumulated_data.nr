use crate::{
    abis::{
        log_hash::LogHash, note_hash::NoteHash, nullifier::Nullifier,
        private_call_request::PrivateCallRequest, private_log::PrivateLogData,
        public_call_request::PublicCallRequest,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    side_effect::{Counted, Scoped},
    traits::Empty,
};
use crate::constants::{
    MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
    MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
    MAX_PRIVATE_LOGS_PER_TX,
};
use crate::utils::arrays::ClaimedLengthArray;
use std::meta::derive;

#[derive(Eq)]
pub struct PrivateAccumulatedData {
    pub note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, MAX_NOTE_HASHES_PER_TX>,
    pub nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, MAX_NULLIFIERS_PER_TX>,
    pub l2_to_l1_msgs: ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, MAX_L2_TO_L1_MSGS_PER_TX>,

    pub private_logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, MAX_PRIVATE_LOGS_PER_TX>,
    pub contract_class_logs_hashes: ClaimedLengthArray<Scoped<Counted<LogHash>>, MAX_CONTRACT_CLASS_LOGS_PER_TX>,

    pub public_call_requests: ClaimedLengthArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_TX>,
    pub private_call_stack: ClaimedLengthArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
}

impl Empty for PrivateAccumulatedData {
    fn empty() -> Self {
        PrivateAccumulatedData {
            note_hashes: ClaimedLengthArray::empty(),
            nullifiers: ClaimedLengthArray::empty(),
            l2_to_l1_msgs: ClaimedLengthArray::empty(),
            private_logs: ClaimedLengthArray::empty(),
            contract_class_logs_hashes: ClaimedLengthArray::empty(),
            public_call_requests: ClaimedLengthArray::empty(),
            private_call_stack: ClaimedLengthArray::empty(),
        }
    }
}
