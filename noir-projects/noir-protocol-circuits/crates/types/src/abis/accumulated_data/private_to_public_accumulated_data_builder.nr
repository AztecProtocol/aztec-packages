use crate::{
    abis::{
        accumulated_data::private_to_public_accumulated_data::PrivateToPublicAccumulatedData,
        log_hash::{LogHash, ScopedLogHash},
        public_call_request::PublicCallRequest,
    },
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENCRYPTED_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX,
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_ENCRYPTED_LOGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::Empty,
    utils::arrays::array_to_bounded_vec,
};

pub struct PrivateToPublicAccumulatedDataBuilder {
    note_hashes: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    nullifiers: BoundedVec<Field, MAX_NULLIFIERS_PER_TX>,
    l2_to_l1_msgs: BoundedVec<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX>,
    note_encrypted_logs_hashes: BoundedVec<LogHash, MAX_NOTE_ENCRYPTED_LOGS_PER_TX>,
    encrypted_logs_hashes: BoundedVec<ScopedLogHash, MAX_ENCRYPTED_LOGS_PER_TX>,
    contract_class_logs_hashes: BoundedVec<ScopedLogHash, MAX_CONTRACT_CLASS_LOGS_PER_TX>,
    public_call_requests: BoundedVec<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX>,
}

impl PrivateToPublicAccumulatedDataBuilder {
    pub fn new(data: PrivateToPublicAccumulatedData) -> Self {
        PrivateToPublicAccumulatedDataBuilder {
            note_hashes: array_to_bounded_vec(data.note_hashes),
            nullifiers: array_to_bounded_vec(data.nullifiers),
            l2_to_l1_msgs: array_to_bounded_vec(data.l2_to_l1_msgs),
            note_encrypted_logs_hashes: array_to_bounded_vec(data.note_encrypted_logs_hashes),
            encrypted_logs_hashes: array_to_bounded_vec(data.encrypted_logs_hashes),
            contract_class_logs_hashes: array_to_bounded_vec(data.contract_class_logs_hashes),
            public_call_requests: array_to_bounded_vec(data.public_call_requests),
        }
    }

    pub fn finish(self) -> PrivateToPublicAccumulatedData {
        PrivateToPublicAccumulatedData {
            note_hashes: self.note_hashes.storage(),
            nullifiers: self.nullifiers.storage(),
            l2_to_l1_msgs: self.l2_to_l1_msgs.storage(),
            note_encrypted_logs_hashes: self.note_encrypted_logs_hashes.storage(),
            encrypted_logs_hashes: self.encrypted_logs_hashes.storage(),
            contract_class_logs_hashes: self.contract_class_logs_hashes.storage(),
            public_call_requests: self.public_call_requests.storage(),
        }
    }
}

impl Empty for PrivateToPublicAccumulatedDataBuilder {
    fn empty() -> Self {
        PrivateToPublicAccumulatedDataBuilder {
            note_hashes: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            l2_to_l1_msgs: BoundedVec::new(),
            note_encrypted_logs_hashes: BoundedVec::new(),
            encrypted_logs_hashes: BoundedVec::new(),
            contract_class_logs_hashes: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
        }
    }
}
