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
        PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Deserialize, Empty, Serialize},
    transaction::tx_context::TxContext,
    utils::{arrays::EmptyRHSArray, reader::Reader},
};

#[derive(Eq)]
pub struct EmptyRHSValidatedPrivateCallArrays {
    pub note_hash_read_requests: EmptyRHSArray<ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>,
    pub nullifier_read_requests: EmptyRHSArray<ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL>,
    pub key_validation_requests_and_generators: EmptyRHSArray<KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL>,
    pub note_hashes: EmptyRHSArray<NoteHash, MAX_NOTE_HASHES_PER_CALL>,
    pub nullifiers: EmptyRHSArray<Nullifier, MAX_NULLIFIERS_PER_CALL>,
    pub l2_to_l1_msgs: EmptyRHSArray<L2ToL1Message, MAX_L2_TO_L1_MSGS_PER_CALL>,
    pub private_call_requests: EmptyRHSArray<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    pub public_call_requests: EmptyRHSArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_CALL>,
    pub private_logs: EmptyRHSArray<PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL>,
    pub contract_class_logs_hashes: EmptyRHSArray<Counted<LogHash>, MAX_CONTRACT_CLASS_LOGS_PER_CALL>,
}

impl EmptyRHSValidatedPrivateCallArrays {
    pub fn new(public_inputs: PrivateCircuitPublicInputs) -> Self {
        EmptyRHSValidatedPrivateCallArrays {
            note_hash_read_requests: EmptyRHSArray::new(public_inputs.note_hash_read_requests),
            nullifier_read_requests: EmptyRHSArray::new(public_inputs.nullifier_read_requests),
            key_validation_requests_and_generators: EmptyRHSArray::new(
                public_inputs.key_validation_requests_and_generators,
            ),
            note_hashes: EmptyRHSArray::new(public_inputs.note_hashes),
            nullifiers: EmptyRHSArray::new(public_inputs.nullifiers),
            l2_to_l1_msgs: EmptyRHSArray::new(public_inputs.l2_to_l1_msgs),
            private_call_requests: EmptyRHSArray::new(public_inputs.private_call_requests),
            public_call_requests: EmptyRHSArray::new(public_inputs.public_call_requests),
            private_logs: EmptyRHSArray::new(public_inputs.private_logs),
            contract_class_logs_hashes: EmptyRHSArray::new(
                public_inputs.contract_class_logs_hashes,
            ),
        }
    }
}

// Public inputs to private app circuit.
#[derive(Eq)]
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
    pub l2_to_l1_msgs: [Counted<L2ToL1Message>; MAX_L2_TO_L1_MSGS_PER_CALL],
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

impl Serialize<PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PrivateCircuitPublicInputs {
    fn serialize(self) -> [Field; PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH> = BoundedVec::new();
        fields.extend_from_array(self.call_context.serialize());
        fields.push(self.args_hash);
        fields.push(self.returns_hash);

        fields.push(self.min_revertible_side_effect_counter as Field);
        fields.push(if self.is_fee_payer { 1 } else { 0 } as Field);

        fields.extend_from_array(self.max_block_number.serialize());

        for i in 0..self.note_hash_read_requests.len() {
            fields.extend_from_array(self.note_hash_read_requests[i].serialize());
        }
        for i in 0..self.nullifier_read_requests.len() {
            fields.extend_from_array(self.nullifier_read_requests[i].serialize());
        }
        for i in 0..self.key_validation_requests_and_generators.len() {
            fields.extend_from_array(self.key_validation_requests_and_generators[i].serialize());
        }
        for i in 0..self.note_hashes.len() {
            fields.extend_from_array(self.note_hashes[i].serialize());
        }
        for i in 0..self.nullifiers.len() {
            fields.extend_from_array(self.nullifiers[i].serialize());
        }
        for i in 0..self.private_call_requests.len() {
            fields.extend_from_array(self.private_call_requests[i].serialize());
        }
        for i in 0..self.public_call_requests.len() {
            fields.extend_from_array(self.public_call_requests[i].serialize());
        }
        fields.extend_from_array(self.public_teardown_call_request.serialize());
        for i in 0..self.l2_to_l1_msgs.len() {
            fields.extend_from_array(self.l2_to_l1_msgs[i].serialize());
        }
        for i in 0..self.private_logs.len() {
            fields.extend_from_array(self.private_logs[i].serialize());
        }
        for i in 0..self.contract_class_logs_hashes.len() {
            fields.extend_from_array(self.contract_class_logs_hashes[i].serialize());
        }
        fields.push(self.start_side_effect_counter as Field);
        fields.push(self.end_side_effect_counter as Field);
        fields.extend_from_array(self.historical_header.serialize());
        fields.extend_from_array(self.tx_context.serialize());

        assert_eq(fields.len(), PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage()
    }
}

impl Deserialize<PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PrivateCircuitPublicInputs {
    fn deserialize(serialized: [Field; PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH]) -> Self {
        // TODO(#4390): This should accept a reader ^ to avoid copying data.
        let mut reader = Reader::new(serialized);
        let inputs = Self {
            call_context: reader.read_struct(CallContext::deserialize),
            args_hash: reader.read(),
            returns_hash: reader.read(),
            min_revertible_side_effect_counter: reader.read() as u32,
            is_fee_payer: reader.read() == 1,
            max_block_number: reader.read_struct(MaxBlockNumber::deserialize),
            note_hash_read_requests: reader.read_struct_array(
                ReadRequest::deserialize,
                [ReadRequest::empty(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
            ),
            nullifier_read_requests: reader.read_struct_array(
                ReadRequest::deserialize,
                [ReadRequest::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_CALL],
            ),
            key_validation_requests_and_generators: reader.read_struct_array(
                KeyValidationRequestAndGenerator::deserialize,
                [KeyValidationRequestAndGenerator::empty(); MAX_KEY_VALIDATION_REQUESTS_PER_CALL],
            ),
            note_hashes: reader.read_struct_array(
                NoteHash::deserialize,
                [NoteHash::empty(); MAX_NOTE_HASHES_PER_CALL],
            ),
            nullifiers: reader.read_struct_array(
                Nullifier::deserialize,
                [Nullifier::empty(); MAX_NULLIFIERS_PER_CALL],
            ),
            private_call_requests: reader.read_struct_array(
                PrivateCallRequest::deserialize,
                [PrivateCallRequest::empty(); MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL],
            ),
            public_call_requests: reader.read_struct_array(
                Counted::deserialize,
                [Counted::empty(); MAX_ENQUEUED_CALLS_PER_CALL],
            ),
            public_teardown_call_request: reader.read_struct(PublicCallRequest::deserialize),
            l2_to_l1_msgs: reader.read_struct_array(
                Counted::deserialize,
                [Counted::empty(); MAX_L2_TO_L1_MSGS_PER_CALL],
            ),
            private_logs: reader.read_struct_array(
                PrivateLogData::deserialize,
                [PrivateLogData::empty(); MAX_PRIVATE_LOGS_PER_CALL],
            ),
            contract_class_logs_hashes: reader.read_struct_array(
                Counted::deserialize,
                [Counted::empty(); MAX_CONTRACT_CLASS_LOGS_PER_CALL],
            ),
            start_side_effect_counter: reader.read() as u32,
            end_side_effect_counter: reader.read() as u32,
            historical_header: reader.read_struct(BlockHeader::deserialize),
            tx_context: reader.read_struct(TxContext::deserialize),
        };

        reader.finish();
        inputs
    }
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
            l2_to_l1_msgs: [Counted::empty(); MAX_L2_TO_L1_MSGS_PER_CALL],
            private_logs: [PrivateLogData::empty(); MAX_PRIVATE_LOGS_PER_CALL],
            contract_class_logs_hashes: [Counted::empty(); MAX_CONTRACT_CLASS_LOGS_PER_CALL],
            start_side_effect_counter: 0 as u32,
            end_side_effect_counter: 0 as u32,
            historical_header: BlockHeader::empty(),
            tx_context: TxContext::empty(),
        }
    }
}

#[test]
fn serialization_of_empty() {
    let pcpi = PrivateCircuitPublicInputs::empty();
    let serialized = pcpi.serialize();
    let deserialized = PrivateCircuitPublicInputs::deserialize(serialized);
    assert(pcpi.eq(deserialized));
}
