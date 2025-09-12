mod tail_to_public_output_hints;

use crate::{
    abis::PaddedSideEffectAmounts,
    components::{
        tail_output_validator::validate_include_by_timestamp_duration,
        tail_to_public_output_composer::meter_gas_used,
    },
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::{
            PrivateKernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
        },
        log_hash::LogHash,
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_log::{PrivateLog, PrivateLogData},
        public_call_request::PublicCallRequest,
        side_effect::{Counted, scoped::Scoped},
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    utils::arrays::{
        assert_split_sorted_transformed_value_arrays_asc, assert_split_transformed_padded_arrays,
    },
};
use tail_to_public_output_hints::{generate_tail_to_public_output_hints, TailToPublicOutputHints};

pub struct TailToPublicOutputValidator {
    output: PrivateToPublicKernelCircuitPublicInputs,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    include_by_timestamp_upper_bound: u64,
    hints: TailToPublicOutputHints,
}

impl TailToPublicOutputValidator {
    pub fn new(
        output: PrivateToPublicKernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        padded_side_effect_amounts: PaddedSideEffectAmounts,
        include_by_timestamp_upper_bound: u64,
    ) -> Self {
        // Safety: the below hints are constrained by calling .validate(). See private_kernel_tail_to_public for use.
        let hints = unsafe { generate_tail_to_public_output_hints(previous_kernel) };

        TailToPublicOutputValidator {
            output,
            previous_kernel,
            padded_side_effect_amounts,
            include_by_timestamp_upper_bound,
            hints,
        }
    }

    pub fn validate(self) {
        self.validate_propagated_values();
        self.validate_propagated_split_values();
        self.validate_propagated_sorted_values();
        self.validate_gas_used();
    }

    fn validate_propagated_values(self) {
        assert_eq(self.output.constants, self.previous_kernel.constants, "mismatch constants");

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
            self.previous_kernel.constants.historical_header.global_variables,
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
        assert_split_transformed_padded_arrays(
            prev_data.note_hashes.array,
            output_non_revertible.note_hashes,
            output_revertible.note_hashes,
            |prev: ScopedNoteHash, out: Field| {
                assert_eq(out, prev.note_hash.value, "invalid transformed value")
            },
            split_counter,
            self.padded_side_effect_amounts.non_revertible_note_hashes,
        );

        // nullifiers
        assert_split_transformed_padded_arrays(
            prev_data.nullifiers.array,
            output_non_revertible.nullifiers,
            output_revertible.nullifiers,
            |prev: ScopedNullifier, out: Field| {
                assert_eq(out, prev.nullifier.value, "invalid transformed value")
            },
            split_counter,
            self.padded_side_effect_amounts.non_revertible_nullifiers,
        );

        // private_logs
        assert_split_transformed_padded_arrays(
            prev_data.private_logs.array,
            output_non_revertible.private_logs,
            output_revertible.private_logs,
            |prev: Scoped<PrivateLogData>, out: PrivateLog| {
                assert_eq(out, prev.expose_to_public(), "invalid transformed value")
            },
            split_counter,
            self.padded_side_effect_amounts.non_revertible_private_logs,
        );
    }

    fn validate_propagated_sorted_values(self) {
        let split_counter = self.previous_kernel.min_revertible_side_effect_counter;
        let prev_data = self.previous_kernel.end;
        let output_non_revertible = self.output.non_revertible_accumulated_data;
        let output_revertible = self.output.revertible_accumulated_data;
        let hints = self.hints;

        // l2_to_l1_msgs
        assert_split_sorted_transformed_value_arrays_asc(
            prev_data.l2_to_l1_msgs.array,
            prev_data.l2_to_l1_msgs.array.map(|msg: Scoped<Counted<L2ToL1Message>>| {
                msg.expose_to_public()
            }),
            split_counter,
            output_non_revertible.l2_to_l1_msgs,
            output_revertible.l2_to_l1_msgs,
            hints.sorted_l2_to_l1_msg_hints,
        );

        // contract_class_logs_hashes
        assert_split_sorted_transformed_value_arrays_asc(
            prev_data.contract_class_logs_hashes.array,
            prev_data.contract_class_logs_hashes.array.map(|log: Scoped<Counted<LogHash>>| {
                log.expose_to_public()
            }),
            split_counter,
            output_non_revertible.contract_class_logs_hashes,
            output_revertible.contract_class_logs_hashes,
            hints.sorted_contract_class_log_hash_hints,
        );

        // public_call_requests
        assert_split_sorted_transformed_value_arrays_asc(
            prev_data.public_call_requests.array,
            prev_data.public_call_requests.array.map(|cr: Counted<PublicCallRequest>| cr.inner),
            split_counter,
            output_non_revertible.public_call_requests,
            output_revertible.public_call_requests,
            hints.sorted_public_call_request_hints,
        )
    }

    fn validate_gas_used(self) {
        let gas_settings = self.output.constants.tx_context.gas_settings;
        let gas_used = meter_gas_used(
            self.output.non_revertible_accumulated_data,
            self.output.revertible_accumulated_data,
            self.output.public_teardown_call_request,
            gas_settings.teardown_gas_limits,
        );

        assert_eq(self.output.gas_used, gas_used, "incorrect metered gas used");

        assert(gas_used.within(gas_settings.gas_limits), "The gas used exceeds the gas limits");
    }
}
