use crate::{
    abis::PaddedSideEffectAmounts,
    accumulated_data::{
        assert_split_sorted_transformed_arrays,
        assert_split_transformed_arrays_from_sorted_padded_array,
    },
    components::{
        gas_meter::meter_gas_used, tail_output_validator::validate_include_by_timestamp_duration,
    },
};
use dep::types::abis::kernel_circuit_public_inputs::{
    PrivateKernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
};

pub struct TailToPublicOutputValidator {
    pub(crate) output: PrivateToPublicKernelCircuitPublicInputs,
    pub(crate) previous_kernel: PrivateKernelCircuitPublicInputs,
    pub(crate) padded_side_effect_amounts: PaddedSideEffectAmounts,
    pub(crate) include_by_timestamp_upper_bound: u64,
}

impl TailToPublicOutputValidator {
    pub fn new(
        output: PrivateToPublicKernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        padded_side_effect_amounts: PaddedSideEffectAmounts,
        include_by_timestamp_upper_bound: u64,
    ) -> Self {
        TailToPublicOutputValidator {
            output,
            previous_kernel,
            padded_side_effect_amounts,
            include_by_timestamp_upper_bound,
        }
    }

    pub fn validate(self) {
        self.validate_propagated_values();
        self.validate_propagated_split_values();
        self.validate_propagated_sorted_values();
        self.validate_gas_used();
    }

    fn validate_propagated_values(self) {
        assert_eq(
            self.output.constants,
            self.previous_kernel.constants.to_tx_constant_data(),
            "mismatch constants",
        );

        assert_eq(self.output.fee_payer, self.previous_kernel.fee_payer, "mismatch fee_payer");

        // `include_by_timestamp` - The timestamp at which the transaction expires.
        // This value can only decrease with each iteration. Here we take the minimum of:
        // - The value from the previous kernel iteration
        // - An upper bound value set by the user
        let include_by_timestamp = std::cmp::min(
            self.previous_kernel.include_by_timestamp,
            self.include_by_timestamp_upper_bound,
        );
        validate_include_by_timestamp_duration(
            include_by_timestamp,
            self.previous_kernel.constants.anchor_block_header.global_variables,
        );
        assert_eq(
            self.output.include_by_timestamp,
            include_by_timestamp,
            "incorrect include_by_timestamp",
        );

        // public_teardown_call_request
        assert_eq(
            self.output.public_teardown_call_request,
            self.previous_kernel.public_teardown_call_request,
            "mismatch public_teardown_call_request",
        );
    }

    fn validate_propagated_split_values(self) {
        let split_counter = self.previous_kernel.min_revertible_side_effect_counter;
        let prev_data = self.previous_kernel.end;
        let output_non_revertible = self.output.non_revertible_accumulated_data;
        let output_revertible = self.output.revertible_accumulated_data;

        // note_hashes
        assert_split_transformed_arrays_from_sorted_padded_array(
            prev_data.note_hashes.array,
            output_non_revertible.note_hashes,
            output_revertible.note_hashes,
            split_counter,
            |prev, out| assert_eq(out, prev.expose_to_public(), "incorrect output note_hashes"),
            self.padded_side_effect_amounts.non_revertible_note_hashes,
        );

        // nullifiers
        assert_split_transformed_arrays_from_sorted_padded_array(
            prev_data.nullifiers.array,
            output_non_revertible.nullifiers,
            output_revertible.nullifiers,
            split_counter,
            |prev, out| assert_eq(out, prev.expose_to_public(), "incorrect output nullifiers"),
            self.padded_side_effect_amounts.non_revertible_nullifiers,
        );

        // private_logs
        assert_split_transformed_arrays_from_sorted_padded_array(
            prev_data.private_logs.array,
            output_non_revertible.private_logs,
            output_revertible.private_logs,
            split_counter,
            |prev, out| assert_eq(out, prev.expose_to_public(), "incorrect output private_logs"),
            self.padded_side_effect_amounts.non_revertible_private_logs,
        );
    }

    fn validate_propagated_sorted_values(self) {
        let split_counter = self.previous_kernel.min_revertible_side_effect_counter;
        let prev_data = self.previous_kernel.end;
        let output_non_revertible = self.output.non_revertible_accumulated_data;
        let output_revertible = self.output.revertible_accumulated_data;

        // l2_to_l1_msgs
        assert_split_sorted_transformed_arrays(
            prev_data.l2_to_l1_msgs,
            output_non_revertible.l2_to_l1_msgs,
            output_revertible.l2_to_l1_msgs,
            split_counter,
            |prev, out| assert_eq(out, prev.expose_to_public(), "incorrect output l2_to_l1_msg"),
        );

        // contract_class_logs_hashes
        assert_split_sorted_transformed_arrays(
            prev_data.contract_class_logs_hashes,
            output_non_revertible.contract_class_logs_hashes,
            output_revertible.contract_class_logs_hashes,
            split_counter,
            |prev, out| {
                assert_eq(out, prev.expose_to_public(), "incorrect output contract_class_log_hash")
            },
        );

        // public_call_requests
        assert_split_sorted_transformed_arrays(
            prev_data.public_call_requests,
            output_non_revertible.public_call_requests,
            output_revertible.public_call_requests,
            split_counter,
            |prev, out| {
                assert_eq(out, prev.expose_to_public(), "incorrect output public_call_request")
            },
        )
    }

    fn validate_gas_used(self) {
        let gas_used = meter_gas_used(self.previous_kernel, true);
        assert_eq(self.output.gas_used, gas_used, "incorrect metered gas used");

        let gas_settings = self.output.constants.tx_context.gas_settings;
        assert(gas_used.within(gas_settings.gas_limits), "The gas used exceeds the gas limits");
    }
}
