use crate::{
    abis::{
        call_context::CallContext, log_hash::LogHash, max_block_number::MaxBlockNumber,
        note_hash::NoteHash, nullifier::Nullifier, private_call_request::PrivateCallRequest,
        private_log::PrivateLogData, public_call_request::PublicCallRequest,
        read_request::ReadRequest, side_effect::Counted,
        validation_requests::KeyValidationRequestAndGenerator,
    },
    block_header::BlockHeader,
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
    utils::{arrays::validate_array, reader::Reader},
};
use std::meta::derive;

pub struct PrivateCircuitPublicInputsArrayLengths {
    pub note_hash_read_requests: u32,
    pub nullifier_read_requests: u32,
    pub key_validation_requests_and_generators: u32,
    pub note_hashes: u32,
    pub nullifiers: u32,
    pub l2_to_l1_msgs: u32,
    pub private_call_requests: u32,
    pub public_call_requests: u32,
    pub private_logs: u32,
    pub contract_class_logs_hashes: u32,
}

impl PrivateCircuitPublicInputsArrayLengths {
    pub fn new(public_inputs: PrivateCircuitPublicInputs) -> Self {
        PrivateCircuitPublicInputsArrayLengths {
            note_hash_read_requests: validate_array(public_inputs.note_hash_read_requests),
            nullifier_read_requests: validate_array(public_inputs.nullifier_read_requests),
            key_validation_requests_and_generators: validate_array(
                public_inputs.key_validation_requests_and_generators,
            ),
            note_hashes: validate_array(public_inputs.note_hashes),
            nullifiers: validate_array(public_inputs.nullifiers),
            l2_to_l1_msgs: validate_array(public_inputs.l2_to_l1_msgs),
            private_call_requests: validate_array(public_inputs.private_call_requests),
            public_call_requests: validate_array(public_inputs.public_call_requests),
            private_logs: validate_array(public_inputs.private_logs),
            contract_class_logs_hashes: validate_array(public_inputs.contract_class_logs_hashes),
        }
    }
}

// Public inputs to private app circuit.
#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateCircuitPublicInputs {
    pub call_context: CallContext,

    pub args_hash: Field,
    pub returns_hash: Field,

    pub min_revertible_side_effect_counter: u32,
    pub is_fee_payer: bool,

    pub max_block_number: MaxBlockNumber,

    pub note_hash_read_requests: [ReadRequest; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    pub nullifier_read_requests: [ReadRequest; MAX_NULLIFIER_READ_REQUESTS_PER_CALL],
    pub key_validation_requests_and_generators: [KeyValidationRequestAndGenerator; MAX_KEY_VALIDATION_REQUESTS_PER_CALL],

    pub note_hashes: [NoteHash; MAX_NOTE_HASHES_PER_CALL],
    pub nullifiers: [Nullifier; MAX_NULLIFIERS_PER_CALL],
    pub private_call_requests: [PrivateCallRequest; MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL],
    pub public_call_requests: [Counted<PublicCallRequest>; MAX_ENQUEUED_CALLS_PER_CALL],
    pub public_teardown_call_request: PublicCallRequest,
    pub l2_to_l1_msgs: [L2ToL1Message; MAX_L2_TO_L1_MSGS_PER_CALL],
    pub private_logs: [PrivateLogData; MAX_PRIVATE_LOGS_PER_CALL],
    pub contract_class_logs_hashes: [Counted<LogHash>; MAX_CONTRACT_CLASS_LOGS_PER_CALL],

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
            max_block_number: MaxBlockNumber::empty(),
            note_hash_read_requests: [ReadRequest::empty(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
            nullifier_read_requests: [ReadRequest::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_CALL],
            key_validation_requests_and_generators: [
                KeyValidationRequestAndGenerator::empty(); MAX_KEY_VALIDATION_REQUESTS_PER_CALL
            ],
            note_hashes: [NoteHash::empty(); MAX_NOTE_HASHES_PER_CALL],
            nullifiers: [Nullifier::empty(); MAX_NULLIFIERS_PER_CALL],
            private_call_requests: [
                PrivateCallRequest::empty(); MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL
            ],
            public_call_requests: [Counted::empty(); MAX_ENQUEUED_CALLS_PER_CALL],
            public_teardown_call_request: PublicCallRequest::empty(),
            l2_to_l1_msgs: [L2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_CALL],
            private_logs: [PrivateLogData::empty(); MAX_PRIVATE_LOGS_PER_CALL],
            contract_class_logs_hashes: [Counted::empty(); MAX_CONTRACT_CLASS_LOGS_PER_CALL],
            start_side_effect_counter: 0 as u32,
            end_side_effect_counter: 0 as u32,
            historical_header: BlockHeader::empty(),
            tx_context: TxContext::empty(),
        }
    }
}

mod test {
    use crate::{
        abis::private_circuit_public_inputs::PrivateCircuitPublicInputs,
        constants::PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_private_circuit_public_inputs() {
        let item = PrivateCircuitPublicInputs::empty();
        // We use the PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH] = item.serialize();
        let deserialized = PrivateCircuitPublicInputs::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
