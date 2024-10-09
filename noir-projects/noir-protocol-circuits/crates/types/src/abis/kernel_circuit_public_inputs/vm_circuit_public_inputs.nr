use crate::{
    abis::{
    gas::Gas, global_variables::GlobalVariables,
    kernel_circuit_public_inputs::public_kernel_accumulated_array_lengths::PublicKernelAccumulatedArrayLengths,
    note_hash::ScopedNoteHash, log_hash::ScopedLogHash, nullifier::Nullifier,
    public_call_request::PublicCallRequest, public_inner_call_request::PublicInnerCallRequest,
    public_data_read::PublicDataRead, public_data_update_request::PublicDataUpdateRequest,
    read_request::ScopedReadRequest, tree_leaf_read_request::TreeLeafReadRequest
},
    constants::{
    MAX_L2_TO_L1_MSGS_PER_TX, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, MAX_NOTE_HASHES_PER_TX,
    MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
    MAX_NULLIFIERS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
    MAX_PUBLIC_DATA_READS_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    VM_CIRCUIT_PUBLIC_INPUTS_LENGTH
},
    messaging::l2_to_l1_message::ScopedL2ToL1Message, traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader
};

pub struct VMCircuitPublicInputs {
    global_variables: GlobalVariables,
    call_request: PublicCallRequest,

    // TODO(#7124): To be deprecated. Used by the temporary PublicKernelInner to combine nested calls in an enqueued call.
    public_call_stack: [PublicInnerCallRequest; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],

    // Validation requests emitted throughout the enqueued call.
    note_hash_read_requests: [TreeLeafReadRequest; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
    nullifier_read_requests: [ScopedReadRequest; MAX_NULLIFIER_READ_REQUESTS_PER_TX],
    nullifier_non_existent_read_requests: [ScopedReadRequest; MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX],
    l1_to_l2_msg_read_requests: [TreeLeafReadRequest; MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX],
    public_data_reads: [PublicDataRead; MAX_PUBLIC_DATA_READS_PER_TX],

    // Data emitted throughout the enqueued call.
    note_hashes: [ScopedNoteHash; MAX_NOTE_HASHES_PER_TX],
    nullifiers: [Nullifier; MAX_NULLIFIERS_PER_TX],
    l2_to_l1_msgs: [ScopedL2ToL1Message; MAX_L2_TO_L1_MSGS_PER_TX],
    unencrypted_logs_hashes: [ScopedLogHash; MAX_UNENCRYPTED_LOGS_PER_TX],
    public_data_update_requests: [PublicDataUpdateRequest; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],

    previous_array_lengths: PublicKernelAccumulatedArrayLengths, // Lengths of the accumulated data/validation requests before the enqueued call.

    start_side_effect_counter: u32,
    end_side_effect_counter: u32,
    start_gas_left: Gas,
    end_gas_left: Gas,
    transaction_fee: Field,
    reverted: bool,
}

impl Empty for VMCircuitPublicInputs {
    fn empty() -> Self {
        VMCircuitPublicInputs {
            global_variables: GlobalVariables::empty(),
            call_request: PublicCallRequest::empty(),
            public_call_stack: [PublicInnerCallRequest::empty(); MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
            note_hash_read_requests: [TreeLeafReadRequest::empty(); MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
            nullifier_read_requests: [ScopedReadRequest::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX],
            nullifier_non_existent_read_requests: [ScopedReadRequest::empty(); MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX],
            l1_to_l2_msg_read_requests: [TreeLeafReadRequest::empty(); MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX],
            public_data_reads: [PublicDataRead::empty(); MAX_PUBLIC_DATA_READS_PER_TX],
            note_hashes: [ScopedNoteHash::empty(); MAX_NOTE_HASHES_PER_TX],
            nullifiers: [Nullifier::empty(); MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX],
            unencrypted_logs_hashes: [ScopedLogHash::empty(); MAX_UNENCRYPTED_LOGS_PER_TX],
            public_data_update_requests: [PublicDataUpdateRequest::empty(); MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
            previous_array_lengths: PublicKernelAccumulatedArrayLengths::empty(),
            start_side_effect_counter: 0,
            end_side_effect_counter: 0,
            start_gas_left: Gas::empty(),
            end_gas_left: Gas::empty(),
            transaction_fee: 0,
            reverted: false
        }
    }
}

impl Eq for VMCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.global_variables == other.global_variables)
            & (self.call_request == other.call_request)
            & (self.public_call_stack == other.public_call_stack)
            & (self.note_hash_read_requests == other.note_hash_read_requests)
            & (self.nullifier_read_requests == other.nullifier_read_requests)
            & (self.nullifier_non_existent_read_requests
                                == other.nullifier_non_existent_read_requests)
            & (self.l1_to_l2_msg_read_requests == other.l1_to_l2_msg_read_requests)
            & (self.public_data_reads == other.public_data_reads)
            & (self.note_hashes == other.note_hashes)
            & (self.nullifiers == other.nullifiers)
            & (self.l2_to_l1_msgs == other.l2_to_l1_msgs)
            & (self.unencrypted_logs_hashes
                                                        == other.unencrypted_logs_hashes)
            & (self.public_data_update_requests
                                                            == other.public_data_update_requests)
            & (self.previous_array_lengths
                                                                == other.previous_array_lengths)
            & (self.start_side_effect_counter
                                                                    == other.start_side_effect_counter)
            & (self.end_side_effect_counter
                                                                        == other.end_side_effect_counter)
            & (self.start_gas_left
                                                                            == other.start_gas_left)
            & (self.end_gas_left
                                                                                == other.end_gas_left)
            & (self.transaction_fee
                                                                                    == other.transaction_fee)
            & (self.reverted
                                                                                        == other.reverted)
    }
}

impl Serialize<VM_CIRCUIT_PUBLIC_INPUTS_LENGTH> for VMCircuitPublicInputs {
    fn serialize(self) -> [Field; VM_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, VM_CIRCUIT_PUBLIC_INPUTS_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.global_variables.serialize());
        fields.extend_from_array(self.call_request.serialize());
        for i in 0..MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX {
            fields.extend_from_array(self.public_call_stack[i].serialize());
        }
        for i in 0..self.note_hash_read_requests.len() {
            fields.extend_from_array(self.note_hash_read_requests[i].serialize());
        }
        for i in 0..self.nullifier_read_requests.len() {
            fields.extend_from_array(self.nullifier_read_requests[i].serialize());
        }
        for i in 0..self.nullifier_non_existent_read_requests.len() {
            fields.extend_from_array(self.nullifier_non_existent_read_requests[i].serialize());
        }
        for i in 0..self.l1_to_l2_msg_read_requests.len() {
            fields.extend_from_array(self.l1_to_l2_msg_read_requests[i].serialize());
        }
        for i in 0..self.public_data_reads.len() {
            fields.extend_from_array(self.public_data_reads[i].serialize());
        }
        for i in 0..MAX_NOTE_HASHES_PER_TX {
            fields.extend_from_array(self.note_hashes[i].serialize());
        }
        for i in 0..MAX_NULLIFIERS_PER_TX {
            fields.extend_from_array(self.nullifiers[i].serialize());
        }
        for i in 0..MAX_L2_TO_L1_MSGS_PER_TX {
            fields.extend_from_array(self.l2_to_l1_msgs[i].serialize());
        }
        for i in 0..MAX_UNENCRYPTED_LOGS_PER_TX {
            fields.extend_from_array(self.unencrypted_logs_hashes[i].serialize());
        }
        for i in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            fields.extend_from_array(self.public_data_update_requests[i].serialize());
        }

        fields.extend_from_array(self.previous_array_lengths.serialize());
        fields.push(self.start_side_effect_counter as Field);
        fields.push(self.end_side_effect_counter as Field);
        fields.extend_from_array(self.start_gas_left.serialize());
        fields.extend_from_array(self.end_gas_left.serialize());
        fields.push(self.transaction_fee);
        fields.push(self.reverted as Field);

        assert_eq(fields.len(), VM_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage
    }
}

impl Deserialize<VM_CIRCUIT_PUBLIC_INPUTS_LENGTH> for VMCircuitPublicInputs {
    fn deserialize(fields: [Field; VM_CIRCUIT_PUBLIC_INPUTS_LENGTH]) -> VMCircuitPublicInputs {
        let mut reader = Reader::new(fields);
        let item = VMCircuitPublicInputs {
            global_variables: reader.read_struct(GlobalVariables::deserialize),
            call_request: reader.read_struct(PublicCallRequest::deserialize),
            public_call_stack: reader.read_struct_array(
                PublicInnerCallRequest::deserialize,
                [PublicInnerCallRequest::empty(); MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX]
            ),
            note_hash_read_requests: reader.read_struct_array(
                TreeLeafReadRequest::deserialize,
                [TreeLeafReadRequest::empty(); MAX_NOTE_HASH_READ_REQUESTS_PER_TX]
            ),
            nullifier_read_requests: reader.read_struct_array(
                ScopedReadRequest::deserialize,
                [ScopedReadRequest::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX]
            ),
            nullifier_non_existent_read_requests: reader.read_struct_array(
                ScopedReadRequest::deserialize,
                [ScopedReadRequest::empty(); MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX]
            ),
            l1_to_l2_msg_read_requests: reader.read_struct_array(
                TreeLeafReadRequest::deserialize,
                [TreeLeafReadRequest::empty(); MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX]
            ),
            public_data_reads: reader.read_struct_array(
                PublicDataRead::deserialize,
                [PublicDataRead::empty(); MAX_PUBLIC_DATA_READS_PER_TX]
            ),
            note_hashes: reader.read_struct_array(
                ScopedNoteHash::deserialize,
                [ScopedNoteHash::empty(); MAX_NOTE_HASHES_PER_TX]
            ),
            nullifiers: reader.read_struct_array(
                Nullifier::deserialize,
                [Nullifier::empty(); MAX_NULLIFIERS_PER_TX]
            ),
            l2_to_l1_msgs: reader.read_struct_array(
                ScopedL2ToL1Message::deserialize,
                [ScopedL2ToL1Message::empty(); MAX_L2_TO_L1_MSGS_PER_TX]
            ),
            unencrypted_logs_hashes: reader.read_struct_array(
                ScopedLogHash::deserialize,
                [ScopedLogHash::empty(); MAX_UNENCRYPTED_LOGS_PER_TX]
            ),
            public_data_update_requests: reader.read_struct_array(
                PublicDataUpdateRequest::deserialize,
                [PublicDataUpdateRequest::empty(); MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX]
            ),
            previous_array_lengths: reader.read_struct(PublicKernelAccumulatedArrayLengths::deserialize),
            start_side_effect_counter: reader.read_u32(),
            end_side_effect_counter: reader.read_u32(),
            start_gas_left: reader.read_struct(Gas::deserialize),
            end_gas_left: reader.read_struct(Gas::deserialize),
            transaction_fee: reader.read(),
            reverted: reader.read() as bool
        };
        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty() {
    let item = VMCircuitPublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = VMCircuitPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
