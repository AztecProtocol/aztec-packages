use crate::{
    abis::{
        accumulated_data::private_accumulated_data::PrivateAccumulatedData,
        log_hash::{NoteLogHash, ScopedEncryptedLogHash, ScopedLogHash},
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_call_request::PrivateCallRequest,
        public_call_request::PublicCallRequest,
        side_effect::Counted,
    },
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENCRYPTED_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX,
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::Empty,
};

pub struct PrivateAccumulatedDataBuilder {
    pub note_hashes: BoundedVec<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>,
    pub nullifiers: BoundedVec<ScopedNullifier, MAX_NULLIFIERS_PER_TX>,
    pub l2_to_l1_msgs: BoundedVec<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX>,

    pub note_encrypted_logs_hashes: BoundedVec<NoteLogHash, MAX_NOTE_ENCRYPTED_LOGS_PER_TX>,
    pub encrypted_logs_hashes: BoundedVec<ScopedEncryptedLogHash, MAX_ENCRYPTED_LOGS_PER_TX>,
    pub contract_class_logs_hashes: BoundedVec<ScopedLogHash, MAX_CONTRACT_CLASS_LOGS_PER_TX>,

    pub public_call_requests: BoundedVec<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_TX>,
    pub private_call_stack: BoundedVec<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
}

impl PrivateAccumulatedDataBuilder {
    pub fn finish(self) -> PrivateAccumulatedData {
        PrivateAccumulatedData {
            note_hashes: self.note_hashes.storage(),
            nullifiers: self.nullifiers.storage(),
            l2_to_l1_msgs: self.l2_to_l1_msgs.storage(),
            note_encrypted_logs_hashes: self.note_encrypted_logs_hashes.storage(),
            encrypted_logs_hashes: self.encrypted_logs_hashes.storage(),
            contract_class_logs_hashes: self.contract_class_logs_hashes.storage(),
            public_call_requests: self.public_call_requests.storage(),
            private_call_stack: self.private_call_stack.storage(),
        }
    }
}

impl Empty for PrivateAccumulatedDataBuilder {
    fn empty() -> Self {
        PrivateAccumulatedDataBuilder {
            note_hashes: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            l2_to_l1_msgs: BoundedVec::new(),
            note_encrypted_logs_hashes: BoundedVec::new(),
            encrypted_logs_hashes: BoundedVec::new(),
            contract_class_logs_hashes: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
            private_call_stack: BoundedVec::new(),
        }
    }
}
