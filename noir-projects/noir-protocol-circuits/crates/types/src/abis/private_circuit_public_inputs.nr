use crate::{
    abis::{
        block_header::BlockHeader, call_context::CallContext, log_hash::LogHash,
        note_hash::NoteHash, nullifier::Nullifier, private_call_request::PrivateCallRequest,
        private_log::PrivateLogData, public_call_request::PublicCallRequest,
        read_request::ReadRequest, side_effect::Counted,
        validation_requests::KeyValidationRequestAndGenerator,
    },
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_CALL, MAX_ENQUEUED_CALLS_PER_CALL,
        MAX_KEY_VALIDATION_REQUESTS_PER_CALL, MAX_L2_TO_L1_MSGS_PER_CALL,
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
    transaction::tx_context::TxContext,
    utils::arrays::ClaimedLengthArray,
};
use std::meta::derive;

// Public inputs to private app circuit.
#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateCircuitPublicInputs {
    pub call_context: CallContext,

    pub args_hash: Field,
    pub returns_hash: Field,

    pub min_revertible_side_effect_counter: u32,
    pub is_fee_payer: bool,

    pub include_by_timestamp: u64,

    pub note_hash_read_requests: ClaimedLengthArray<ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>,
    pub nullifier_read_requests: ClaimedLengthArray<ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL>,
    pub key_validation_requests_and_generators: ClaimedLengthArray<KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL>,

    pub note_hashes: ClaimedLengthArray<NoteHash, MAX_NOTE_HASHES_PER_CALL>,
    pub nullifiers: ClaimedLengthArray<Nullifier, MAX_NULLIFIERS_PER_CALL>,
    pub private_call_requests: ClaimedLengthArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    pub public_call_requests: ClaimedLengthArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_CALL>,
    pub public_teardown_call_request: PublicCallRequest,
    pub l2_to_l1_msgs: ClaimedLengthArray<Counted<L2ToL1Message>, MAX_L2_TO_L1_MSGS_PER_CALL>,
    pub private_logs: ClaimedLengthArray<PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL>,
    pub contract_class_logs_hashes: ClaimedLengthArray<Counted<LogHash>, MAX_CONTRACT_CLASS_LOGS_PER_CALL>,

    pub start_side_effect_counter: u32,
    pub end_side_effect_counter: u32,

    // Header of a block whose state is used during private execution (not the block the transaction is included in).
    pub historical_header: BlockHeader,

    // Note: The chain_id and version here are not redundant to the values in self.historical_header.global_variables because
    // they can be different in case of a protocol upgrade. In such a situation we could be using header from a block
    // before the upgrade took place but be using the updated protocol to execute and prove the transaction.
    pub tx_context: TxContext,
}

impl Empty for PrivateCircuitPublicInputs {
    fn empty() -> Self {
        PrivateCircuitPublicInputs {
            call_context: CallContext::empty(),
            args_hash: 0,
            returns_hash: 0,
            min_revertible_side_effect_counter: 0 as u32,
            is_fee_payer: false,
            include_by_timestamp: 0,
            note_hash_read_requests: ClaimedLengthArray::<ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>::empty(),
            nullifier_read_requests: ClaimedLengthArray::<ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL>::empty(),
            key_validation_requests_and_generators: ClaimedLengthArray::<KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL>::empty(),
            note_hashes: ClaimedLengthArray::<NoteHash, MAX_NOTE_HASHES_PER_CALL>::empty(),
            nullifiers: ClaimedLengthArray::<Nullifier, MAX_NULLIFIERS_PER_CALL>::empty(),
            private_call_requests: ClaimedLengthArray::<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>::empty(),
            public_call_requests: ClaimedLengthArray::<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_CALL>::empty(),
            public_teardown_call_request: PublicCallRequest::empty(),
            l2_to_l1_msgs: ClaimedLengthArray::<Counted<L2ToL1Message>, MAX_L2_TO_L1_MSGS_PER_CALL>::empty(),
            private_logs: ClaimedLengthArray::<PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL>::empty(),
            contract_class_logs_hashes: ClaimedLengthArray::<Counted<LogHash>, MAX_CONTRACT_CLASS_LOGS_PER_CALL>::empty(),
            start_side_effect_counter: 0 as u32,
            end_side_effect_counter: 0 as u32,
            historical_header: BlockHeader::empty(),
            tx_context: TxContext::empty(),
        }
    }
}
