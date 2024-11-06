use crate::public_kernel_phase::PublicKernelPhase;
use dep::types::{
    abis::{
        accumulated_data::PublicAccumulatedDataArrayLengths, enqueued_call_data::EnqueuedCallData,
        kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
        public_call_request::PublicCallRequest,
        validation_requests::PublicValidationRequestArrayLengths,
    },
    constants::MAX_L2_GAS_PER_ENQUEUED_CALL,
    utils::arrays::array_length,
};

pub struct EnqueuedCallDataValidator {
    enqueued_call: EnqueuedCallData,
    phase: u8,
}

impl EnqueuedCallDataValidator {
    pub fn new(enqueued_call: EnqueuedCallData, phase: u8) -> Self {
        EnqueuedCallDataValidator { enqueued_call, phase }
    }

    pub fn validate_proof(_self: Self) {
        // TODO
    }

    pub fn validate(self) {
        self.validate_revert_flag()
    }

    pub fn validate_against_previous_kernel(
        self,
        previous_kernel: PublicKernelCircuitPublicInputs,
        previous_validation_request_array_lengths: PublicValidationRequestArrayLengths,
        previous_non_revertible_data_array_lengths: PublicAccumulatedDataArrayLengths,
        previous_revertible_data_array_lengths: PublicAccumulatedDataArrayLengths,
    ) {
        self.validate_global_variables(previous_kernel);
        self.validate_against_call_request(previous_kernel);
        self.validate_start_gas(previous_kernel);
        self.validate_transaction_fee(previous_kernel);
        self.validate_array_lengths(
            previous_validation_request_array_lengths,
            previous_non_revertible_data_array_lengths,
            previous_revertible_data_array_lengths,
        );
    }

    fn validate_revert_flag(self) {
        if self.phase == PublicKernelPhase.SETUP {
            assert_eq(self.enqueued_call.data.reverted, false, "Public call cannot be reverted");
        }
    }

    fn validate_global_variables(self, previous_kernel: PublicKernelCircuitPublicInputs) {
        let prev_global_variables = previous_kernel.constants.global_variables;
        if !prev_global_variables.is_empty() {
            // It's empty when the previous kernel is from private_kernel_tail_to_pubic.
            let enqueued_call_globals = self.enqueued_call.data.constants.global_variables;
            assert_eq(
                enqueued_call_globals,
                prev_global_variables,
                "Global variables injected into the public call do not match constants",
            );
        }
    }

    fn validate_against_call_request(self, previous_kernel: PublicKernelCircuitPublicInputs) {
        let call_request = if self.phase == PublicKernelPhase.SETUP {
            let call_stack = previous_kernel.end_non_revertible.public_call_stack;
            call_stack[array_length(call_stack) - 1]
        } else if self.phase == PublicKernelPhase.APP_LOGIC {
            let call_stack = previous_kernel.end.public_call_stack;
            call_stack[array_length(call_stack) - 1]
        } else if self.phase == PublicKernelPhase.TEARDOWN {
            previous_kernel.public_teardown_call_request
        } else {
            assert(false, "Unknown phase");
            PublicCallRequest::empty()
        };

        assert(
            self.enqueued_call.data.call_request == call_request,
            "enqueued call does not match item at the top of the call stack",
        );
    }

    // Validates that the start gas injected into the vm circuit matches the remaining gas.
    fn validate_start_gas(self, previous_kernel: PublicKernelCircuitPublicInputs) {
        let enqueued_call_start_gas = self.enqueued_call.data.start_gas_left;
        // NOTE: the AVM circuit will fail to generate a proof if its "start gas" is > MAX_L2_GAS_PER_ENQUEUED_CALL,
        // so the kernel never allocates more than that maximum to one enqueued call.
        if self.phase != PublicKernelPhase.TEARDOWN {
            // An enqueued call's start gas is the remaining gas left in the transaction after the previous kernel.
            let tx_gas_limits = previous_kernel.constants.tx_context.gas_settings.gas_limits;
            let mut computed_start_gas = tx_gas_limits.sub(previous_kernel.end.gas_used).sub(
                previous_kernel.end_non_revertible.gas_used,
            );
            // Keep L2 gas below max
            computed_start_gas.l2_gas =
                std::cmp::min(computed_start_gas.l2_gas, MAX_L2_GAS_PER_ENQUEUED_CALL);
            assert_eq(
                enqueued_call_start_gas,
                computed_start_gas,
                "Start gas for enqueued call does not match transaction gas left (with MAX_L2_GAS_PER_ENQUEUED_CALL applied)",
            );
        } else {
            let mut teardown_gas_limit =
                previous_kernel.constants.tx_context.gas_settings.teardown_gas_limits;
            // Keep L2 gas below max
            teardown_gas_limit.l2_gas =
                std::cmp::min(teardown_gas_limit.l2_gas, MAX_L2_GAS_PER_ENQUEUED_CALL);
            assert_eq(
                enqueued_call_start_gas,
                teardown_gas_limit,
                "Start gas for enqueued call does not match teardown gas allocation (with MAX_L2_GAS_PER_ENQUEUED_CALL applied)",
            );
        }
    }

    fn validate_transaction_fee(self, previous_kernel: PublicKernelCircuitPublicInputs) {
        let transaction_fee = self.enqueued_call.data.transaction_fee;
        if self.phase != PublicKernelPhase.TEARDOWN {
            assert_eq(transaction_fee, 0, "Transaction fee must be zero on setup and app phases");
        } else {
            // Note that teardown_gas is already included in end.gas_used as it was injected by the private kernel
            let total_gas_used =
                previous_kernel.end.gas_used + previous_kernel.end_non_revertible.gas_used;
            let block_gas_fees = self.enqueued_call.data.constants.global_variables.gas_fees;
            let inclusion_fee = previous_kernel.constants.tx_context.gas_settings.inclusion_fee;
            let computed_transaction_fee =
                total_gas_used.compute_fee(block_gas_fees) + inclusion_fee;
            assert(
                transaction_fee == computed_transaction_fee,
                "Transaction fee on teardown phase does not match expected value",
            );
        }
    }

    fn validate_array_lengths(
        self,
        previous_validation_request_array_lengths: PublicValidationRequestArrayLengths,
        previous_non_revertible_data_array_lengths: PublicAccumulatedDataArrayLengths,
        previous_revertible_data_array_lengths: PublicAccumulatedDataArrayLengths,
    ) {
        assert_eq(
            self.enqueued_call.data.previous_validation_request_array_lengths,
            previous_validation_request_array_lengths,
            "mismatch previous_validation_request_array_lengths",
        );
        let prev_lengths = if self.phase == PublicKernelPhase.SETUP {
            previous_non_revertible_data_array_lengths
        } else {
            previous_revertible_data_array_lengths
        };
        assert_eq(
            self.enqueued_call.data.previous_accumulated_data_array_lengths,
            prev_lengths,
            "mismatch previous_accumulated_data_array_lengths",
        );
    }
}
