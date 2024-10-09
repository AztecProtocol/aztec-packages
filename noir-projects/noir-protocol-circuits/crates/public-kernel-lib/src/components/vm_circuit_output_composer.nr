mod propagate_accumulated_data;

use crate::{components::vm_circuit_output_composer::propagate_accumulated_data::propagate_accumulated_data};
use dep::types::{
    abis::{
    gas::Gas, global_variables::GlobalVariables,
    kernel_circuit_public_inputs::{
    public_kernel_accumulated_array_lengths::PublicKernelAccumulatedArrayLengths,
    vm_circuit_public_inputs::VMCircuitPublicInputs
},
    log_hash::ScopedLogHash, note_hash::ScopedNoteHash, nullifier::Nullifier,
    public_call_request::PublicCallRequest, public_circuit_public_inputs::PublicCircuitPublicInputs,
    public_data_read::PublicDataRead, public_data_update_request::PublicDataUpdateRequest,
    public_inner_call_request::PublicInnerCallRequest, read_request::ScopedReadRequest,
    tree_leaf_read_request::TreeLeafReadRequest
},
    constants::{
    MAX_L2_TO_L1_MSGS_PER_TX, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, MAX_NOTE_HASHES_PER_TX,
    MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
    MAX_NULLIFIERS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
    MAX_PUBLIC_DATA_READS_PER_TX, MAX_UNENCRYPTED_LOGS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    VM_CIRCUIT_PUBLIC_INPUTS_LENGTH
},
    hash::compute_siloed_nullifier, messaging::l2_to_l1_message::ScopedL2ToL1Message, traits::is_empty,
    utils::arrays::array_to_bounded_vec
};

// TODO(#7124): To be deprecated.
pub struct VMCircuitOutputComposer {
    global_variables: GlobalVariables,
    call_request: PublicCallRequest,
    public_call_stack: BoundedVec<PublicInnerCallRequest, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,

    note_hash_read_requests: BoundedVec<TreeLeafReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    nullifier_read_requests: BoundedVec<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    nullifier_non_existent_read_requests: BoundedVec<ScopedReadRequest, MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX>,
    public_data_reads: BoundedVec<PublicDataRead, MAX_PUBLIC_DATA_READS_PER_TX>,
    l1_to_l2_msg_read_requests: BoundedVec<TreeLeafReadRequest, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX>,

    note_hashes: BoundedVec<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>,
    nullifiers: BoundedVec<Nullifier, MAX_NULLIFIERS_PER_TX>,
    l2_to_l1_msgs: BoundedVec<ScopedL2ToL1Message, MAX_L2_TO_L1_MSGS_PER_TX>,
    unencrypted_logs_hashes: BoundedVec<ScopedLogHash, MAX_UNENCRYPTED_LOGS_PER_TX>,
    public_data_update_requests: BoundedVec<PublicDataUpdateRequest, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,

    previous_array_lengths: PublicKernelAccumulatedArrayLengths,
    start_side_effect_counter: u32,
    end_side_effect_counter: u32,
    start_gas_left: Gas,
    end_gas_left: Gas,
    transaction_fee: Field,
    reverted: bool,
}

impl VMCircuitOutputComposer {
    pub fn new_from_previous_kernel(prev: VMCircuitPublicInputs) -> Self {
        let mut public_call_stack = array_to_bounded_vec(prev.public_call_stack);
        let _ = public_call_stack.pop();
        VMCircuitOutputComposer {
            global_variables: prev.global_variables,
            call_request: prev.call_request,
            public_call_stack,
            note_hash_read_requests: array_to_bounded_vec(prev.note_hash_read_requests),
            nullifier_read_requests: array_to_bounded_vec(prev.nullifier_read_requests),
            nullifier_non_existent_read_requests: array_to_bounded_vec(prev.nullifier_non_existent_read_requests),
            public_data_reads: array_to_bounded_vec(prev.public_data_reads),
            l1_to_l2_msg_read_requests: array_to_bounded_vec(prev.l1_to_l2_msg_read_requests),
            note_hashes: array_to_bounded_vec(prev.note_hashes),
            nullifiers: array_to_bounded_vec(prev.nullifiers),
            l2_to_l1_msgs: array_to_bounded_vec(prev.l2_to_l1_msgs),
            unencrypted_logs_hashes: array_to_bounded_vec(prev.unencrypted_logs_hashes),
            public_data_update_requests: array_to_bounded_vec(prev.public_data_update_requests),
            previous_array_lengths: PublicKernelAccumulatedArrayLengths::new_from_vm_circuit(prev),
            start_side_effect_counter: prev.start_side_effect_counter,
            end_side_effect_counter: prev.end_side_effect_counter,
            start_gas_left: prev.start_gas_left,
            end_gas_left: prev.end_gas_left,
            transaction_fee: prev.transaction_fee,
            reverted: prev.reverted
        }
    }

    pub fn propagate_from_public_call(&mut self, public_call: PublicCircuitPublicInputs) -> Self {
        self.global_variables = public_call.global_variables;
        self.propagate_revert_flag(public_call);
        self.propagate_validation_requests(public_call);
        self.propagate_accumulated_data(public_call);
        self.propagate_call_requests(public_call);
        self.propagate_end_side_effect_counter(public_call);
        self.propagate_end_gas_left(public_call);
        // Other values should be the same throughout the entire enqueued call.
        *self
    }

    pub fn finish(self) -> VMCircuitPublicInputs {
        VMCircuitPublicInputs {
            global_variables: self.global_variables,
            call_request: self.call_request,
            public_call_stack: self.public_call_stack.storage,
            note_hashes: self.note_hashes.storage,
            nullifiers: self.nullifiers.storage,
            l2_to_l1_msgs: self.l2_to_l1_msgs.storage,
            unencrypted_logs_hashes: self.unencrypted_logs_hashes.storage,
            public_data_update_requests: self.public_data_update_requests.storage,
            note_hash_read_requests: self.note_hash_read_requests.storage,
            nullifier_read_requests: self.nullifier_read_requests.storage,
            nullifier_non_existent_read_requests: self.nullifier_non_existent_read_requests.storage,
            public_data_reads: self.public_data_reads.storage,
            l1_to_l2_msg_read_requests: self.l1_to_l2_msg_read_requests.storage,
            previous_array_lengths: self.previous_array_lengths,
            start_side_effect_counter: self.start_side_effect_counter,
            end_side_effect_counter: self.end_side_effect_counter,
            start_gas_left: self.start_gas_left,
            end_gas_left: self.end_gas_left,
            transaction_fee: self.transaction_fee,
            reverted: self.reverted
        }
    }

    fn propagate_revert_flag(&mut self, public_call: PublicCircuitPublicInputs) {
        if !self.reverted {
            self.reverted = public_call.revert_code != 0;
        }
    }

    fn propagate_validation_requests(&mut self, public_call: PublicCircuitPublicInputs) {
        let storage_contract_address = public_call.call_context.storage_contract_address;

        let note_hash_read_requests = public_call.note_hash_read_requests;
        for i in 0..note_hash_read_requests.len() {
            let request = note_hash_read_requests[i];
            if !is_empty(request) {
                self.note_hash_read_requests.push(request);
            }
        }

        let nullifier_read_requests = public_call.nullifier_read_requests;
        for i in 0..nullifier_read_requests.len() {
            let request = nullifier_read_requests[i];
            if !is_empty(request) {
                self.nullifier_read_requests.push(request.scope(storage_contract_address));
            }
        }

        let nullifier_non_existent_read_requests = public_call.nullifier_non_existent_read_requests;
        for i in 0..nullifier_non_existent_read_requests.len() {
            let request = nullifier_non_existent_read_requests[i];
            if !is_empty(request) {
                self.nullifier_non_existent_read_requests.push(request.scope(storage_contract_address));
            }
        }

        let l1_to_l2_msg_read_requests = public_call.l1_to_l2_msg_read_requests;
        for i in 0..l1_to_l2_msg_read_requests.len() {
            let request = l1_to_l2_msg_read_requests[i];
            if !is_empty(request) {
                self.l1_to_l2_msg_read_requests.push(request);
            }
        }

        let read_requests = public_call.contract_storage_reads;
        for i in 0..read_requests.len() {
            let read_request = read_requests[i];
            if !is_empty(read_request) {
                self.public_data_reads.push(PublicDataRead::from_contract_storage_read(storage_contract_address, read_request));
            }
        }
    }

    fn propagate_accumulated_data(&mut self, public_call: PublicCircuitPublicInputs) {
        let storage_contract_address = public_call.call_context.storage_contract_address;

        let note_hashes = public_call.note_hashes;
        for i in 0..note_hashes.len() {
            let note_hash = note_hashes[i];
            if note_hash.counter != 0 {
                self.note_hashes.push(note_hash.scope(storage_contract_address));
            }
        }

        let nullifiers = public_call.nullifiers;
        for i in 0..nullifiers.len() {
            let nullifier = nullifiers[i];
            if nullifier.counter != 0 {
                let siloed_value = compute_siloed_nullifier(storage_contract_address, nullifier.value);
                self.nullifiers.push(
                    Nullifier { value: siloed_value, counter: nullifier.counter, note_hash: nullifier.note_hash }
                );
            }
        }

        let msgs = public_call.l2_to_l1_msgs;
        for i in 0..msgs.len() {
            let msg = msgs[i];
            if msg.counter != 0 {
                self.l2_to_l1_msgs.push(msg.scope(storage_contract_address));
            }
        }

        let logs = public_call.unencrypted_logs_hashes;
        for i in 0..logs.len() {
            let log = logs[i];
            if log.counter != 0 {
                self.unencrypted_logs_hashes.push(log.scope(storage_contract_address));
            }
        }

        let writes = public_call.contract_storage_update_requests;
        for i in 0..writes.len() {
            let write = writes[i];
            if write.counter != 0 {
                self.public_data_update_requests.push(
                    PublicDataUpdateRequest::from_contract_storage_update_request(storage_contract_address, write)
                );
            }
        }
    }

    fn propagate_call_requests(&mut self, public_call: PublicCircuitPublicInputs) {
        let call_requests = array_to_bounded_vec(public_call.public_call_requests);
        self.public_call_stack.extend_from_bounded_vec(call_requests);
    }

    fn propagate_end_side_effect_counter(&mut self, public_call: PublicCircuitPublicInputs) {
        if public_call.end_side_effect_counter > self.end_side_effect_counter {
            self.end_side_effect_counter = public_call.end_side_effect_counter;
        }
    }

    fn propagate_end_gas_left(&mut self, public_call: PublicCircuitPublicInputs) {
        self.end_gas_left = self.end_gas_left.add(public_call.end_gas_left).sub(public_call.start_gas_left);
    }
}
