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
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};
use crate::constants::{
    MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
    MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
    MAX_PRIVATE_LOGS_PER_TX, PRIVATE_ACCUMULATED_DATA_LENGTH,
};
use crate::utils::arrays::AppendedUnvalidatedArray;

pub struct PrivateAccumulatedData {
    pub note_hashes: AppendedUnvalidatedArray<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>,
    pub nullifiers: AppendedUnvalidatedArray<ScopedNullifier, MAX_NULLIFIERS_PER_TX>,
    pub l2_to_l1_msgs: AppendedUnvalidatedArray<Scoped<Counted<L2ToL1Message>>, MAX_L2_TO_L1_MSGS_PER_TX>,

    pub private_logs: AppendedUnvalidatedArray<Scoped<PrivateLogData>, MAX_PRIVATE_LOGS_PER_TX>,
    pub contract_class_logs_hashes: AppendedUnvalidatedArray<Scoped<Counted<LogHash>>, MAX_CONTRACT_CLASS_LOGS_PER_TX>,

    pub public_call_requests: AppendedUnvalidatedArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_TX>,
    pub private_call_stack: AppendedUnvalidatedArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
}

impl Eq for PrivateAccumulatedData {
    fn eq(self, other: Self) -> bool {
        (self.note_hashes == other.note_hashes)
            & (self.nullifiers == other.nullifiers)
            & (self.l2_to_l1_msgs == other.l2_to_l1_msgs)
            & (self.private_logs == other.private_logs)
            & (self.contract_class_logs_hashes == other.contract_class_logs_hashes)
            & (self.public_call_requests == other.public_call_requests)
            & (self.private_call_stack == other.private_call_stack)
    }
}

impl Empty for PrivateAccumulatedData {
    fn empty() -> Self {
        let note_hashes: AppendedUnvalidatedArray<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX> =
            AppendedUnvalidatedArray::empty();
        let nullifiers: AppendedUnvalidatedArray<ScopedNullifier, MAX_NULLIFIERS_PER_TX> =
            AppendedUnvalidatedArray::empty();
        let l2_to_l1_msgs: AppendedUnvalidatedArray<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX> =
            AppendedUnvalidatedArray::empty();
        let private_logs: AppendedUnvalidatedArray<Scoped<PrivateLogData>, MAX_PRIVATE_LOGS_PER_TX> =
            AppendedUnvalidatedArray::empty();
        let contract_class_logs_hashes: AppendedUnvalidatedArray<Scoped<Counted<LogHash>>, MAX_CONTRACT_CLASS_LOGS_PER_TX> =
            AppendedUnvalidatedArray::empty();
        let public_call_requests: AppendedUnvalidatedArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_TX> =
            AppendedUnvalidatedArray::empty();
        let private_call_stack: AppendedUnvalidatedArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX> =
            AppendedUnvalidatedArray::empty();

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
