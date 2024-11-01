mod propagate_accumulated_data;

use crate::{
    components::public_kernel_output_composer::propagate_accumulated_data::propagate_accumulated_data,
    public_kernel_phase::PublicKernelPhase,
};
use dep::types::{
    abis::{
        accumulated_data::PublicAccumulatedDataBuilder,
        kernel_circuit_public_inputs::{
            PublicKernelCircuitPublicInputs, PublicKernelCircuitPublicInputsBuilder,
            VMCircuitPublicInputs,
        },
        public_call_request::PublicCallRequest,
    },
    traits::is_empty,
};

pub struct PublicKernelOutputComposer {
    output_builder: PublicKernelCircuitPublicInputsBuilder,
}

impl PublicKernelOutputComposer {
    pub fn new_from_previous_kernel(previous_kernel: PublicKernelCircuitPublicInputs) -> Self {
        let output_builder = PublicKernelCircuitPublicInputsBuilder::new(previous_kernel);
        PublicKernelOutputComposer { output_builder }
    }

    pub fn remove_top_call_request(&mut self, phase: u8) -> Self {
        if phase == PublicKernelPhase.SETUP {
            let _ = self.output_builder.end_non_revertible.public_call_stack.pop();
        }
        if phase == PublicKernelPhase.APP_LOGIC {
            let _ = self.output_builder.end.public_call_stack.pop();
        }
        if phase == PublicKernelPhase.TEARDOWN {
            self.output_builder.public_teardown_call_request = PublicCallRequest::empty();
        }
        *self
    }

    pub fn propagate_from_enqueued_call(
        &mut self,
        enqueued_call: VMCircuitPublicInputs,
        phase: u8,
    ) -> Self {
        self.output_builder.constants.global_variables = enqueued_call.constants.global_variables;
        self.propagate_revert_code(enqueued_call, phase);
        self.propagate_validation_requests(enqueued_call);
        self.propagate_accumulated_data(enqueued_call, phase);
        self.propagate_end_side_effect_counter(enqueued_call);
        self.update_gas_used(enqueued_call, phase);
        *self
    }

    pub fn finish(self) -> PublicKernelCircuitPublicInputs {
        self.output_builder.finish()
    }

    fn propagate_revert_code(&mut self, enqueued_call: VMCircuitPublicInputs, phase: u8) {
        if enqueued_call.reverted {
            let prev_revert_code = self.output_builder.revert_code;
            if phase == PublicKernelPhase.SETUP {
                // enqueued_call.reverted should be false. If not, EnqueuedCallDataValidator > validate_revert_flag will fail.
            }
            if phase == PublicKernelPhase.APP_LOGIC {
                self.output_builder.revert_code = 1;
            }
            if phase == PublicKernelPhase.TEARDOWN {
                // See https://docs.aztec.network/protocol-specs/gas-and-fees/kernel-tracking#handling-reverts
                self.output_builder.revert_code = if prev_revert_code == 0 {
                    // Case where there is a new error in teardown
                    2
                } else {
                    // Case where there is an error in both app logic and teardown
                    3
                };
            }
        }
    }

    fn propagate_validation_requests(&mut self, enqueued_call: VMCircuitPublicInputs) {
        let data = enqueued_call.validation_requests;
        // Note that the public kernel cannot modify the max block number value - it simply forwards it to the rollup
        let note_hash_read_requests = data.note_hash_read_requests;
        for i in 0..note_hash_read_requests.len() {
            let request = note_hash_read_requests[i];
            if !is_empty(request) {
                self.output_builder.validation_requests.note_hash_read_requests.push(request);
            }
        }

        let nullifier_read_requests = data.nullifier_read_requests;
        for i in 0..nullifier_read_requests.len() {
            let request = nullifier_read_requests[i];
            if !is_empty(request) {
                self.output_builder.validation_requests.nullifier_read_requests.push(request);
            }
        }

        let nullifier_non_existent_read_requests = data.nullifier_non_existent_read_requests;
        for i in 0..nullifier_non_existent_read_requests.len() {
            let request = nullifier_non_existent_read_requests[i];
            if !is_empty(request) {
                self.output_builder.validation_requests.nullifier_non_existent_read_requests.push(
                    request,
                );
            }
        }

        let l1_to_l2_msg_read_requests = data.l1_to_l2_msg_read_requests;
        for i in 0..l1_to_l2_msg_read_requests.len() {
            let request = l1_to_l2_msg_read_requests[i];
            if !is_empty(request) {
                self.output_builder.validation_requests.l1_to_l2_msg_read_requests.push(request);
            }
        }

        let read_requests = data.public_data_reads;
        for i in 0..read_requests.len() {
            let read_request = read_requests[i];
            if !is_empty(read_request) {
                self.output_builder.validation_requests.public_data_reads.push(read_request);
            }
        }
    }

    fn propagate_accumulated_data(&mut self, enqueued_call: VMCircuitPublicInputs, phase: u8) {
        if phase == PublicKernelPhase.SETUP {
            self.output_builder.end_non_revertible = propagate_accumulated_data(
                &mut self.output_builder.end_non_revertible,
                enqueued_call.accumulated_data,
            );
        }
        if (phase == PublicKernelPhase.APP_LOGIC) | (phase == PublicKernelPhase.TEARDOWN) {
            self.output_builder.end = propagate_accumulated_data(
                &mut self.output_builder.end,
                enqueued_call.accumulated_data,
            );
        }

        // TODO: Should keep the data even when reverts.
        // The data is required for verifying validation requests in the tail circuit, which will then discard the
        // revertible data.
        let revert_in_phase = (self.output_builder.revert_code != 0)
            & ((phase != PublicKernelPhase.TEARDOWN) | (self.output_builder.revert_code != 1)); // Revert in APP_LOGIC
        if revert_in_phase {
            let gas_used = self.output_builder.end.gas_used;
            self.output_builder.end = PublicAccumulatedDataBuilder::empty();
            self.output_builder.end.gas_used = gas_used;
        }
    }

    fn propagate_end_side_effect_counter(&mut self, enqueued_call: VMCircuitPublicInputs) {
        self.output_builder.end_side_effect_counter = enqueued_call.end_side_effect_counter;
    }

    fn update_gas_used(&mut self, enqueued_call: VMCircuitPublicInputs, phase: u8) {
        let call_gas_used = enqueued_call.accumulated_data.gas_used;
        if phase == PublicKernelPhase.SETUP {
            self.output_builder.end_non_revertible.gas_used += call_gas_used;
        }
        if phase == PublicKernelPhase.APP_LOGIC {
            self.output_builder.end.gas_used += call_gas_used;
        }
    }
}
