use crate::{
    abis::{
    call_context::CallContext, max_block_number::MaxBlockNumber,
    nullifier_key_validation_request::NullifierKeyValidationRequest, read_request::ReadRequest,
    side_effect::{SideEffect, SideEffectLinkedToNoteHash}
},
    constants::{
    MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
    MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL, MAX_NEW_NOTE_HASHES_PER_CALL,
    MAX_NEW_NULLIFIERS_PER_CALL, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
    MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL, MAX_NEW_L2_TO_L1_MSGS_PER_CALL, RETURN_VALUES_LENGTH,
    PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH, GENERATOR_INDEX__PRIVATE_CIRCUIT_PUBLIC_INPUTS
},
    header::Header, hash::pedersen_hash, messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Deserialize, Hash, Serialize}, utils::reader::Reader
};

struct PrivateCircuitPublicInputs {
    call_context: CallContext,

    args_hash: Field,
    return_values: [Field; RETURN_VALUES_LENGTH],

    min_revertible_side_effect_counter: u32,

    max_block_number: MaxBlockNumber,

    note_hash_read_requests: [SideEffect; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    nullifier_read_requests: [ReadRequest; MAX_NULLIFIER_READ_REQUESTS_PER_CALL],
    nullifier_key_validation_requests: [NullifierKeyValidationRequest; MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL],

    new_note_hashes: [SideEffect; MAX_NEW_NOTE_HASHES_PER_CALL],
    new_nullifiers: [SideEffectLinkedToNoteHash; MAX_NEW_NULLIFIERS_PER_CALL],
    private_call_stack_hashes: [Field; MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL],
    public_call_stack_hashes: [Field; MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL],
    new_l2_to_l1_msgs: [L2ToL1Message; MAX_NEW_L2_TO_L1_MSGS_PER_CALL],

    start_side_effect_counter : u32,
    end_side_effect_counter : u32,
    encrypted_logs_hash: Field,
    unencrypted_logs_hash: Field,

    // Here so that the gas cost of this request can be measured by circuits, without actually needing to feed in the
    // variable-length data.
    encrypted_log_preimages_length: Field,
    unencrypted_log_preimages_length: Field,

    // Header of a block whose state is used during private execution (not the block the transaction is included in).
    historical_header: Header,

    // Note: The following 2 values are not redundant to the values in self.historical_header.global_variables because
    // they can be different in case of a protocol upgrade. In such a situation we could be using header from a block
    // before the upgrade took place but be using the updated protocol to execute and prove the transaction.
    chain_id: Field,
    version: Field,
}

impl Eq for PrivateCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        self.serialize() == other.serialize()
    }
}

impl Default for PrivateCircuitPublicInputs {
    fn default() -> Self {
        PrivateCircuitPublicInputs {
            call_context: CallContext::default(),
            args_hash: 0,
            return_values: [0; RETURN_VALUES_LENGTH],
            min_revertible_side_effect_counter: 0 as u32,
            max_block_number: MaxBlockNumber::default(),
            note_hash_read_requests: [SideEffect::default(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
            nullifier_read_requests: [ReadRequest::default(); MAX_NULLIFIER_READ_REQUESTS_PER_CALL],
            nullifier_key_validation_requests: [NullifierKeyValidationRequest::default(); MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL],
            new_note_hashes: [SideEffect::default(); MAX_NEW_NOTE_HASHES_PER_CALL],
            new_nullifiers: [SideEffectLinkedToNoteHash::default(); MAX_NEW_NULLIFIERS_PER_CALL],
            private_call_stack_hashes: [0; MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL],
            public_call_stack_hashes: [0; MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL],
            new_l2_to_l1_msgs: [L2ToL1Message::default(); MAX_NEW_L2_TO_L1_MSGS_PER_CALL],
            start_side_effect_counter : 0 as u32,
            end_side_effect_counter : 0 as u32,
            encrypted_logs_hash: 0,
            unencrypted_logs_hash: 0,
            encrypted_log_preimages_length: 0,
            unencrypted_log_preimages_length: 0,
            historical_header: Header::default(),
            chain_id: 0,
            version: 0,
        }
    }
}

impl Serialize<PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PrivateCircuitPublicInputs {
    fn serialize(self) -> [Field; PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH> = BoundedVec::new();
        fields.extend_from_array(self.call_context.serialize());
        fields.push(self.args_hash);
        fields.extend_from_array(self.return_values);

        fields.push(self.min_revertible_side_effect_counter as Field);

        fields.extend_from_array(self.max_block_number.serialize());

        for i in 0..MAX_NOTE_HASH_READ_REQUESTS_PER_CALL{
            fields.extend_from_array(self.note_hash_read_requests[i].serialize());
        }
        for i in 0..MAX_NULLIFIER_READ_REQUESTS_PER_CALL{
            fields.extend_from_array(self.nullifier_read_requests[i].serialize());
        }
        for i in 0..MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL{
            fields.extend_from_array(self.nullifier_key_validation_requests[i].serialize());
        }
        for i in 0..MAX_NEW_NOTE_HASHES_PER_CALL{
            fields.extend_from_array(self.new_note_hashes[i].serialize());
        }
        for i in 0..MAX_NEW_NULLIFIERS_PER_CALL{
            fields.extend_from_array(self.new_nullifiers[i].serialize());
        }
        fields.extend_from_array(self.private_call_stack_hashes);
        fields.extend_from_array(self.public_call_stack_hashes);
        for i in 0..MAX_NEW_L2_TO_L1_MSGS_PER_CALL {
            fields.extend_from_array(self.new_l2_to_l1_msgs[i].serialize());
        }
        fields.push(self.start_side_effect_counter as Field);
        fields.push(self.end_side_effect_counter as Field);
        fields.push(self.encrypted_logs_hash);
        fields.push(self.unencrypted_logs_hash);
        fields.push(self.encrypted_log_preimages_length);
        fields.push(self.unencrypted_log_preimages_length);
        fields.extend_from_array(self.historical_header.serialize());
        fields.push(self.chain_id);
        fields.push(self.version);

        assert_eq(fields.len(), PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage
    }
}

impl Deserialize<PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH> for PrivateCircuitPublicInputs {
    fn deserialize(serialized: [Field; PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH]) -> Self {
        // TODO(#4390): This should accept a reader ^ to avoid copying data.
        let mut reader = Reader::new(serialized);
        let inputs = Self {
            call_context: reader.read_struct(CallContext::deserialize),
            args_hash: reader.read(),
            return_values: reader.read_array([0; RETURN_VALUES_LENGTH]),
            min_revertible_side_effect_counter: reader.read() as u32,
            max_block_number: reader.read_struct(MaxBlockNumber::deserialize),
            note_hash_read_requests: reader.read_struct_array(SideEffect::deserialize, [SideEffect::default(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL]),
            nullifier_read_requests: reader.read_struct_array(ReadRequest::deserialize, [ReadRequest::default(); MAX_NULLIFIER_READ_REQUESTS_PER_CALL]),
            nullifier_key_validation_requests: reader.read_struct_array(NullifierKeyValidationRequest::deserialize, [NullifierKeyValidationRequest::default(); MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL]),
            new_note_hashes: reader.read_struct_array(SideEffect::deserialize, [SideEffect::default(); MAX_NEW_NOTE_HASHES_PER_CALL]),
            new_nullifiers: reader.read_struct_array(SideEffectLinkedToNoteHash::deserialize, [SideEffectLinkedToNoteHash::default(); MAX_NEW_NULLIFIERS_PER_CALL]),
            private_call_stack_hashes: reader.read_array([0; MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL]),
            public_call_stack_hashes: reader.read_array([0; MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL]),
            new_l2_to_l1_msgs: reader.read_struct_array(L2ToL1Message::deserialize, [L2ToL1Message::default(); MAX_NEW_L2_TO_L1_MSGS_PER_CALL]),
            start_side_effect_counter: reader.read() as u32,
            end_side_effect_counter: reader.read() as u32,
            encrypted_logs_hash: reader.read() as Field,
            unencrypted_logs_hash: reader.read() as Field,
            encrypted_log_preimages_length: reader.read(),
            unencrypted_log_preimages_length: reader.read(),
            historical_header: reader.read_struct(Header::deserialize),
            chain_id: reader.read(),
            version: reader.read(),
        };

        reader.finish();
        inputs
    }
}

impl Hash for PrivateCircuitPublicInputs {
    fn hash(self) -> Field {
        pedersen_hash(self.serialize(), GENERATOR_INDEX__PRIVATE_CIRCUIT_PUBLIC_INPUTS)
    }
}

#[test]
fn serialization_of_default() {
    let pcpi = PrivateCircuitPublicInputs::default();
    let serialized = pcpi.serialize();
    let deserialized = PrivateCircuitPublicInputs::deserialize(serialized);
    assert(pcpi.eq(deserialized));
}

#[test]
fn default_hash() {
    let inputs = PrivateCircuitPublicInputs::default();
    let hash = inputs.hash();

    // Value from private_circuit_public_inputs.test.ts "computes empty item hash" test
    let test_data_default_hash = 0x1304e6c42e3c53fc7c918cbf1ea70333b4f214726c0784cf9878cd641967dab1;
    assert_eq(hash, test_data_default_hash);
}
