use crate::{
    components::{
    private_call_data_validator::PrivateCallDataValidator,
    private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
    private_kernel_circuit_public_inputs_composer::PrivateKernelCircuitPublicInputsComposer
}
};
use dep::types::{
    abis::{
    kernel_circuit_public_inputs::{PrivateKernelCircuitPublicInputs, PrivateKernelCircuitPublicInputsArrayLengths},
    private_kernel_data::PrivateKernelData, private_kernel::private_call_data::PrivateCallData
},
    constants::MAX_NEW_NOTE_HASHES_PER_CALL
};

struct PrivateKernelInnerHints {
    note_hash_nullifier_counters: [u32; MAX_NEW_NOTE_HASHES_PER_CALL],
}

struct PrivateKernelInnerCircuitPrivateInputs {
    previous_kernel: PrivateKernelData,
    private_call: PrivateCallData,
    hints: PrivateKernelInnerHints,
}

impl PrivateKernelInnerCircuitPrivateInputs {
    unconstrained fn generate_output(self) -> PrivateKernelCircuitPublicInputs {
        PrivateKernelCircuitPublicInputsComposer::new_from_previous_kernel(self.previous_kernel.public_inputs).pop_top_call_request().with_private_call(
            self.private_call.call_stack_item.public_inputs,
            self.private_call.call_stack_item.contract_address,
            self.hints.note_hash_nullifier_counters,
            self.private_call.public_call_stack,
            self.private_call.public_teardown_call_request
        ).finish()
    }

    pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
        // Generate output.
        let output = self.generate_output();

        // Validate inputs.
        let private_call_data_validator = PrivateCallDataValidator::new(self.private_call);
        let previous_kernel_array_lengths = PrivateKernelCircuitPublicInputsArrayLengths::new(self.previous_kernel.public_inputs);
        let private_call_stack_size = previous_kernel_array_lengths.private_call_stack;
        let call_request = self.previous_kernel.public_inputs.end.private_call_stack[private_call_stack_size - 1];
        private_call_data_validator.validate_against_call_request(call_request);
        private_call_data_validator.validate_against_previous_kernel(self.previous_kernel.public_inputs);
        private_call_data_validator.validate(output.end.new_note_hashes);
        if !std::runtime::is_unconstrained() {
            // verify/aggregate the private call proof
            self.private_call.verify();
            // verify/aggregate the previous kernel
            self.previous_kernel.verify();
        }

        // Validate output.
        if !std::runtime::is_unconstrained() {
            PrivateKernelCircuitOutputValidator::new(output).validate_as_inner_call(
                self.previous_kernel.public_inputs,
                previous_kernel_array_lengths,
                self.private_call.call_stack_item.public_inputs,
                private_call_data_validator.array_lengths,
                self.private_call.call_stack_item.contract_address,
                self.hints.note_hash_nullifier_counters,
                self.private_call.public_call_stack,
                self.private_call.public_teardown_call_request
            );
        }
        output
    }
}

mod tests {
    use crate::private_kernel_inner::{PrivateKernelInnerCircuitPrivateInputs, PrivateKernelInnerHints};
    use dep::types::{
        abis::{kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs},
        constants::MAX_NEW_NOTE_HASHES_PER_CALL,
        tests::{fixture_builder::FixtureBuilder, utils::assert_array_eq}
    };

    struct PrivateKernelInnerInputsBuilder {
        previous_kernel: FixtureBuilder,
        private_call: FixtureBuilder,
        hints: PrivateKernelInnerHints,
    }

    impl PrivateKernelInnerInputsBuilder {
        pub fn new() -> Self {
            let mut previous_kernel = FixtureBuilder::new_from_counter(15).as_parent_contract();
            let private_call = FixtureBuilder::new_from_counter(200);
            let hints = PrivateKernelInnerHints { note_hash_nullifier_counters: [0; MAX_NEW_NOTE_HASHES_PER_CALL] };

            // 0th nullifier must be non-zero.
            previous_kernel.append_new_nullifiers(1);

            PrivateKernelInnerInputsBuilder { previous_kernel, private_call, hints }
        }

        pub fn execute(&mut self) -> PrivateKernelCircuitPublicInputs {
            let private_call = self.private_call.to_private_call_data();
            // Update the previous_kernel's private_call_stack with the current call_stack_item.
            let hash = private_call.call_stack_item.hash();
            let is_delegate_call = private_call.call_stack_item.public_inputs.call_context.is_delegate_call;
            self.previous_kernel.add_private_call_request(hash, is_delegate_call);
            let previous_kernel = self.previous_kernel.to_private_kernel_data();

            let kernel = PrivateKernelInnerCircuitPrivateInputs { previous_kernel, private_call, hints: self.hints };

            kernel.execute()
        }
    }

    #[test]
    fn private_kernel_inner_output_as_expected() {
        let mut builder = PrivateKernelInnerInputsBuilder::new();

        // note_hash_read_requests
        builder.previous_kernel.append_note_hash_read_requests(1);
        let prev_note_hash_read_requests = builder.previous_kernel.note_hash_read_requests.storage;
        builder.private_call.append_note_hash_read_requests(2);
        let curr_note_hash_read_requests = builder.private_call.note_hash_read_requests.storage;

        // encrypted_logs_hashes
        builder.previous_kernel.append_encrypted_log_hashes(2);
        let prev_encrypted_log_hashes = builder.previous_kernel.encrypted_logs_hashes.storage;
        builder.private_call.append_encrypted_log_hashes(1);
        let curr_encrypted_log_hashes = builder.private_call.encrypted_logs_hashes.storage;

        let public_inputs = builder.execute();
        assert_array_eq(
            public_inputs.validation_requests.note_hash_read_requests,
            [
            prev_note_hash_read_requests[0], curr_note_hash_read_requests[0], curr_note_hash_read_requests[1]
        ]
        );
        assert_array_eq(
            public_inputs.end.encrypted_logs_hashes,
            [prev_encrypted_log_hashes[0], prev_encrypted_log_hashes[1], curr_encrypted_log_hashes[0]]
        );
    }
}
