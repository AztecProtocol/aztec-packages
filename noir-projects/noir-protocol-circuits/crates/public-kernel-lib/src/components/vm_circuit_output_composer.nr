mod propagate_accumulated_data;

use crate::components::vm_circuit_output_composer::propagate_accumulated_data::propagate_accumulated_data;
use dep::types::{
    abis::{
        accumulated_data::{PublicAccumulatedDataArrayLengths, PublicAccumulatedDataBuilder},
        combined_constant_data::CombinedConstantData,
        gas::Gas,
        kernel_circuit_public_inputs::vm_circuit_public_inputs::VMCircuitPublicInputs,
        public_call_request::PublicCallRequest,
        public_circuit_public_inputs::PublicCircuitPublicInputs,
        public_data_read::PublicDataRead,
        public_inner_call_request::PublicInnerCallRequest,
        validation_requests::{
            public_validation_requests_builder::PublicValidationRequestsBuilder,
            PublicValidationRequestArrayLengths,
        },
    },
    constants::MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
    traits::is_empty,
    utils::arrays::array_to_bounded_vec,
};

// TODO(#7124): To be deprecated.
pub struct VMCircuitOutputComposer {
    constants: CombinedConstantData,
    call_request: PublicCallRequest,
    public_call_stack: BoundedVec<PublicInnerCallRequest, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    previous_validation_request_array_lengths: PublicValidationRequestArrayLengths,
    validation_requests: PublicValidationRequestsBuilder,
    previous_accumulated_data_array_lengths: PublicAccumulatedDataArrayLengths,
    accumulated_data: PublicAccumulatedDataBuilder,
    start_side_effect_counter: u32,
    end_side_effect_counter: u32,
    start_gas_left: Gas,
    transaction_fee: Field,
    reverted: bool,
}

impl VMCircuitOutputComposer {
    pub fn new_from_previous_kernel(previous_kernel: VMCircuitPublicInputs) -> Self {
        let mut public_call_stack = array_to_bounded_vec(previous_kernel.public_call_stack);
        let _ = public_call_stack.pop();
        let validation_requests =
            PublicValidationRequestsBuilder::new(previous_kernel.validation_requests);
        let accumulated_data = PublicAccumulatedDataBuilder::new(previous_kernel.accumulated_data);
        VMCircuitOutputComposer {
            constants: previous_kernel.constants,
            call_request: previous_kernel.call_request,
            public_call_stack,
            previous_validation_request_array_lengths: previous_kernel
                .previous_validation_request_array_lengths,
            validation_requests,
            previous_accumulated_data_array_lengths: previous_kernel
                .previous_accumulated_data_array_lengths,
            accumulated_data,
            start_side_effect_counter: previous_kernel.start_side_effect_counter,
            end_side_effect_counter: previous_kernel.end_side_effect_counter,
            start_gas_left: previous_kernel.start_gas_left,
            transaction_fee: previous_kernel.transaction_fee,
            reverted: previous_kernel.reverted,
        }
    }

    pub fn propagate_from_public_call(&mut self, public_call: PublicCircuitPublicInputs) -> Self {
        self.constants.global_variables = public_call.global_variables;
        self.propagate_revert_flag(public_call);
        self.propagate_validation_requests(public_call);
        self.propagate_accumulated_data(public_call);
        self.propagate_end_side_effect_counter(public_call);
        // Other values should be the same through out the entire enqueued call.
        *self
    }

    pub fn finish(self) -> VMCircuitPublicInputs {
        VMCircuitPublicInputs {
            constants: self.constants,
            call_request: self.call_request,
            public_call_stack: self.public_call_stack.storage,
            previous_validation_request_array_lengths: self
                .previous_validation_request_array_lengths,
            validation_requests: self.validation_requests.finish(),
            previous_accumulated_data_array_lengths: self.previous_accumulated_data_array_lengths,
            accumulated_data: self.accumulated_data.finish(),
            start_side_effect_counter: self.start_side_effect_counter,
            end_side_effect_counter: self.end_side_effect_counter,
            start_gas_left: self.start_gas_left,
            transaction_fee: self.transaction_fee,
            reverted: self.reverted,
        }
    }

    fn propagate_revert_flag(&mut self, public_call: PublicCircuitPublicInputs) {
        if !self.reverted {
            self.reverted = public_call.revert_code != 0;
        }
    }

    fn propagate_validation_requests(&mut self, public_call: PublicCircuitPublicInputs) {
        // Note that the public kernel cannot modify the max block number value - it simply forwards it to the rollup
        let contract_address = public_call.call_context.contract_address;

        let note_hash_read_requests = public_call.note_hash_read_requests;
        for i in 0..note_hash_read_requests.len() {
            let request = note_hash_read_requests[i];
            if !is_empty(request) {
                self.validation_requests.note_hash_read_requests.push(request);
            }
        }

        let nullifier_read_requests = public_call.nullifier_read_requests;
        for i in 0..nullifier_read_requests.len() {
            let request = nullifier_read_requests[i];
            if !is_empty(request) {
                self.validation_requests.nullifier_read_requests.push(request.scope(
                    contract_address,
                ));
            }
        }

        let nullifier_non_existent_read_requests = public_call.nullifier_non_existent_read_requests;
        for i in 0..nullifier_non_existent_read_requests.len() {
            let request = nullifier_non_existent_read_requests[i];
            if !is_empty(request) {
                self.validation_requests.nullifier_non_existent_read_requests.push(request.scope(
                    contract_address,
                ));
            }
        }

        let l1_to_l2_msg_read_requests = public_call.l1_to_l2_msg_read_requests;
        for i in 0..l1_to_l2_msg_read_requests.len() {
            let request = l1_to_l2_msg_read_requests[i];
            if !is_empty(request) {
                self.validation_requests.l1_to_l2_msg_read_requests.push(request);
            }
        }

        let read_requests = public_call.contract_storage_reads;
        for i in 0..read_requests.len() {
            let read_request = read_requests[i];
            if !is_empty(read_request) {
                self.validation_requests.public_data_reads.push(
                    PublicDataRead::from_contract_storage_read(contract_address, read_request),
                );
            }
        }
    }

    fn propagate_accumulated_data(&mut self, public_call: PublicCircuitPublicInputs) {
        // TODO: Should keep the data even when reverts.
        // The data is required for verifying validation requests in the tail circuit, which will then discard the
        // revertible data.
        if self.reverted {
            self.accumulated_data = PublicAccumulatedDataBuilder::empty();
        } else {
            self.accumulated_data =
                propagate_accumulated_data(&mut self.accumulated_data, public_call);
            self.propagate_call_requests(public_call);
        }

        self.accumulated_data.gas_used += public_call.start_gas_left.sub(public_call.end_gas_left);
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
}
