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
    messaging::l2_to_l1_message::L2ToL1Message,
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
    pub note_hashes: ClaimedLengthArray<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>,
    pub nullifiers: ClaimedLengthArray<ScopedNullifier, MAX_NULLIFIERS_PER_TX>,
    pub l2_to_l1_msgs: ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, MAX_L2_TO_L1_MSGS_PER_TX>,

    pub private_logs: ClaimedLengthArray<Scoped<PrivateLogData>, MAX_PRIVATE_LOGS_PER_TX>,
    pub contract_class_logs_hashes: ClaimedLengthArray<Scoped<Counted<LogHash>>, MAX_CONTRACT_CLASS_LOGS_PER_TX>,

    pub public_call_requests: ClaimedLengthArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_TX>,
    pub private_call_stack: ClaimedLengthArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
}

impl Empty for PrivateAccumulatedData {
    fn empty() -> Self {
        let note_hashes: ClaimedLengthArray<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX> =
            ClaimedLengthArray::empty();
        let nullifiers: ClaimedLengthArray<ScopedNullifier, MAX_NULLIFIERS_PER_TX> =
            ClaimedLengthArray::empty();
        let l2_to_l1_msgs: ClaimedLengthArray<Scoped<Counted<L2ToL1Message>>, MAX_L2_TO_L1_MSGS_PER_TX> =
            ClaimedLengthArray::empty();
        let private_logs: ClaimedLengthArray<Scoped<PrivateLogData>, MAX_PRIVATE_LOGS_PER_TX> =
            ClaimedLengthArray::empty();
        let contract_class_logs_hashes: ClaimedLengthArray<Scoped<Counted<LogHash>>, MAX_CONTRACT_CLASS_LOGS_PER_TX> =
            ClaimedLengthArray::empty();
        let public_call_requests: ClaimedLengthArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_TX> =
            ClaimedLengthArray::empty();
        let private_call_stack: ClaimedLengthArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX> =
            ClaimedLengthArray::empty();

        PrivateAccumulatedData {
            note_hashes,
            nullifiers,
            l2_to_l1_msgs,
            private_logs,
            contract_class_logs_hashes,
            public_call_requests,
            private_call_stack,
        }
    }
}
