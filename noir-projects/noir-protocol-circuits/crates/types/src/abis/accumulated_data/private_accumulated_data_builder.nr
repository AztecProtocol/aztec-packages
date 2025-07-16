use crate::{
    abis::{
        accumulated_data::private_accumulated_data::PrivateAccumulatedData,
        log_hash::LogHash,
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_call_request::PrivateCallRequest,
        private_log::PrivateLogData,
        public_call_request::PublicCallRequest,
        side_effect::{Counted, scoped::Scoped},
    },
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
        MAX_PRIVATE_LOGS_PER_TX,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

#[derive(Eq)]
pub struct PrivateAccumulatedDataBuilder {
    pub note_hashes: ClaimedLengthArray<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>,
    pub nullifiers: ClaimedLengthArray<ScopedNullifier, MAX_NULLIFIERS_PER_TX>,
    pub l2_to_l1_msgs: ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, MAX_L2_TO_L1_MSGS_PER_TX>,

    pub private_logs: ClaimedLengthArray<Scoped<PrivateLogData>, MAX_PRIVATE_LOGS_PER_TX>,
    pub contract_class_logs_hashes: ClaimedLengthArray<Scoped<Counted<LogHash>>, MAX_CONTRACT_CLASS_LOGS_PER_TX>,

    pub public_call_requests: ClaimedLengthArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_TX>,
    pub private_call_stack: ClaimedLengthArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
}

// TODO: remove this PrivateAccumulatedDataBuilder, and just construct the PrivateAccumulatedData directly?
impl PrivateAccumulatedDataBuilder {
    pub fn finish(self) -> PrivateAccumulatedData {
        PrivateAccumulatedData {
            note_hashes: self.note_hashes,
            nullifiers: self.nullifiers,
            l2_to_l1_msgs: self.l2_to_l1_msgs,
            private_logs: self.private_logs,
            contract_class_logs_hashes: self.contract_class_logs_hashes,
            public_call_requests: self.public_call_requests,
            private_call_stack: self.private_call_stack,
        }
    }
}

impl Empty for PrivateAccumulatedDataBuilder {
    fn empty() -> Self {
        PrivateAccumulatedDataBuilder {
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
