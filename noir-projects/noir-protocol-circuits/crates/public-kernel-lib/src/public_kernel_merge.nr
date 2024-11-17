use crate::{
    components::{
        enqueued_call_data_validator::EnqueuedCallDataValidator,
        previous_kernel_validator::PreviousKernelValidator,
        public_kernel_output_composer::PublicKernelOutputComposer,
        public_kernel_output_validator::PublicKernelOutputValidator,
    },
    public_kernel_phase::PublicKernelPhase,
};
use dep::types::abis::{
    enqueued_call_data::EnqueuedCallData,
    kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
    public_kernel_data::PublicKernelData,
};

global ALLOWED_PREVIOUS_CIRCUITS = [];

pub struct PublicKernelMergeCircuitPrivateInputs {
    previous_kernel: PublicKernelData,
    enqueued_call: EnqueuedCallData,
}

impl PublicKernelMergeCircuitPrivateInputs {
    unconstrained fn generate_output(self, phase: u8) -> PublicKernelCircuitPublicInputs {
        // noir-fmt:ignore
        PublicKernelOutputComposer::new_from_previous_kernel(self.previous_kernel.public_inputs)
            .remove_top_call_request(phase)
            .propagate_from_enqueued_call(self.enqueued_call.data, phase)
            .finish()
    }

    fn get_phase(self) -> u8 {
        let public_inputs = self.previous_kernel.public_inputs;
        let needs_setup = !public_inputs.end_non_revertible.public_call_stack[0]
            .call_context
            .contract_address
            .is_zero();
        let needs_app_logic =
            !public_inputs.end.public_call_stack[0].call_context.contract_address.is_zero();
        if needs_setup {
            PublicKernelPhase.SETUP
        } else if needs_app_logic {
            PublicKernelPhase.APP_LOGIC
        } else {
            PublicKernelPhase.TEARDOWN
        }
    }

    fn execute(self) -> PublicKernelCircuitPublicInputs {
        let phase = self.get_phase();

        let output = unsafe { self.generate_output(phase) };

        let output_validator = PublicKernelOutputValidator::new(
            output,
            self.previous_kernel.public_inputs,
            self.enqueued_call.data,
            phase,
        );

        // let previous_kernel_validator = PreviousKernelValidator::new(self.previous_kernel);
        // previous_kernel_validator.validate_proof(ALLOWED_PREVIOUS_CIRCUITS);
        let enqueued_call_data_validator =
            EnqueuedCallDataValidator::new(self.enqueued_call, phase);
        // enqueued_call_data_validator.validate_proof();
        enqueued_call_data_validator.validate_against_previous_kernel(
            self.previous_kernel.public_inputs,
            output_validator.previous_validation_request_array_lengths,
            output_validator.previous_non_revertible_data_array_lengths,
            output_validator.previous_revertible_data_array_lengths,
        );

        output_validator.validate();

        output
    }
}

mod tests {
    use crate::{
        public_kernel_merge::{ALLOWED_PREVIOUS_CIRCUITS, PublicKernelMergeCircuitPrivateInputs},
        public_kernel_phase::PublicKernelPhase,
    };
    use dep::types::{
        abis::{
            accumulated_data::PublicAccumulatedDataArrayLengths, gas::Gas,
            kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
            max_block_number::MaxBlockNumber,
            validation_requests::PublicValidationRequestArrayLengths,
        },
        tests::{fixture_builder::FixtureBuilder, utils::assert_array_eq},
    };

    struct PublicKernelMergeCircuitPrivateInputsBuilder {
        previous_kernel: FixtureBuilder,
        previous_revertible: FixtureBuilder,
        enqueued_call: FixtureBuilder,
        phase: u8,
    }

    impl PublicKernelMergeCircuitPrivateInputsBuilder {
        pub fn new() -> Self {
            let previous_kernel = FixtureBuilder::new().as_parent_contract();
            let mut previous_revertible = FixtureBuilder::new();
            let mut enqueued_call = FixtureBuilder::new().is_public_function();
            // Add an offset so that the mock data won't be the same as the values in previous_kernel.
            previous_revertible.value_offset = 5555;
            enqueued_call.counter_start = 7777;
            enqueued_call.value_offset = 9999;

            let phase = PublicKernelPhase.SETUP;

            PublicKernelMergeCircuitPrivateInputsBuilder {
                previous_kernel,
                previous_revertible,
                enqueued_call,
                phase,
            }
        }

        pub fn execute(&mut self) -> PublicKernelCircuitPublicInputs {
            let enqueued_call_request = self.enqueued_call.to_public_call_request();
            if self.phase == PublicKernelPhase.SETUP {
                self.previous_kernel.add_public_call_request(enqueued_call_request);
            } else {
                self.previous_revertible.add_public_call_request(enqueued_call_request);
            }

            let mut previous_kernel = self.previous_kernel.to_public_kernel_data(false);
            previous_kernel.public_inputs.end =
                self.previous_revertible.to_public_accumulated_data();

            let mut enqueued_call = self.enqueued_call.to_enqueued_call_data();
            enqueued_call.data.previous_validation_request_array_lengths = PublicValidationRequestArrayLengths::new(
                previous_kernel.public_inputs.validation_requests,
            );
            enqueued_call.data.previous_accumulated_data_array_lengths = if self.phase
                == PublicKernelPhase.SETUP {
                PublicAccumulatedDataArrayLengths::new(
                    previous_kernel.public_inputs.end_non_revertible,
                )
            } else {
                PublicAccumulatedDataArrayLengths::new(previous_kernel.public_inputs.end)
            };

            previous_kernel.public_inputs.end_side_effect_counter =
                enqueued_call.data.start_side_effect_counter - 1;

            let kernel = PublicKernelMergeCircuitPrivateInputs { previous_kernel, enqueued_call };
            kernel.execute()
        }

        pub fn populate_gas_used(&mut self) {
            // Transaction gas limit is 1k.
            self.previous_kernel.tx_context.gas_settings.gas_limits = Gas::new(1000, 1000);

            // Non-revertible has used 200.
            self.previous_kernel.gas_used = Gas::new(200, 200);

            // Revertible has used 100.
            self.previous_revertible.gas_used = Gas::new(100, 100);

            // So this call starts with 700 gas left
            self.enqueued_call.start_gas_left = Gas::new(700, 700);
            // And uses 250.
            self.enqueued_call.gas_used = Gas::new(250, 250);
            // Ending with 450 left.
            self.enqueued_call.end_gas_left = Gas::new(450, 450);
        }

        pub fn succeeded(&mut self) {
            let _ = self.execute();
        }

        pub fn failed(&mut self) {
            let _ = self.execute();
        }
    }

    #[test]
    unconstrained fn circuit_outputs_should_be_correctly_populated_with_previous_private_kernel() {
        let mut builder = PublicKernelMergeCircuitPrivateInputsBuilder::new();

        builder.previous_kernel.max_block_number = MaxBlockNumber::new(13);

        builder.enqueued_call.append_public_data_read_requests(1);
        let curr_reads = builder.enqueued_call.public_data_reads.storage;
        builder.previous_kernel.append_public_data_read_requests(2);
        let prev_reads = builder.previous_kernel.public_data_reads.storage;

        builder.enqueued_call.append_note_hashes(2);
        let curr_note_hashes = builder.enqueued_call.note_hashes.storage;
        builder.previous_kernel.append_note_hashes(1);
        let prev_note_hashes = builder.previous_kernel.note_hashes.storage;

        builder.enqueued_call.append_public_call_requests(2);
        builder.previous_kernel.append_public_call_requests(1);
        let prev_calls = builder.previous_kernel.public_call_requests.storage;

        let public_inputs = builder.execute();

        assert_eq(public_inputs.validation_requests.for_rollup.max_block_number.unwrap(), 13);

        assert_array_eq(
            public_inputs.validation_requests.public_data_reads,
            [prev_reads[0], prev_reads[1], curr_reads[0]],
        );

        assert_array_eq(
            public_inputs.end_non_revertible.note_hashes,
            [prev_note_hashes[0], curr_note_hashes[0], curr_note_hashes[1]],
        );

        assert_array_eq(
            public_inputs.end_non_revertible.public_call_stack,
            [prev_calls[0]], // Public call requests can only be propagated from previous kernel.
        );
    }

    #[test]
    unconstrained fn updates_revertible_gas_used() {
        let mut builder = PublicKernelMergeCircuitPrivateInputsBuilder::new();
        builder.phase = PublicKernelPhase.APP_LOGIC;

        builder.populate_gas_used();

        // So the updated gas used by revertible must go up by 250, and non-revertible must stay the same.
        let output = builder.execute();
        assert_eq(output.end_non_revertible.gas_used, Gas::new(200, 200));
        assert_eq(output.end.gas_used, Gas::new(350, 350));
    }

    #[test]
    unconstrained fn handle_revert_in_app_logic() {
        let mut builder = PublicKernelMergeCircuitPrivateInputsBuilder::new();
        builder.phase = PublicKernelPhase.APP_LOGIC;
        builder.enqueued_call.revert_code = 1;

        builder.populate_gas_used();

        let output = builder.execute();

        assert_eq(output.revert_code, 1);

        // gas_used is propagated even when reverts.
        assert_eq(output.end_non_revertible.gas_used, Gas::new(200, 200));
        assert_eq(output.end.gas_used, Gas::new(350, 350));
    }
}
