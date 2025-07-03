mod tail_output_hints;
mod validate_include_by_timestamp_duration;

pub(crate) use tail_output_hints::{generate_tail_output_hints, TailOutputHints};
pub(crate) use validate_include_by_timestamp_duration::validate_include_by_timestamp_duration;

use crate::components::tail_output_composer::meter_gas_used;

use dep::types::{
    abis::{
        kernel_circuit_public_inputs::{
            PrivateKernelCircuitPublicInputs, PrivateToRollupKernelCircuitPublicInputs,
        },
        log_hash::LogHash,
        side_effect::{counted::Counted, OrderedValue, scoped::Scoped},
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    utils::arrays::assert_exposed_sorted_transformed_value_array,
};

pub struct TailOutputValidator {
    output: PrivateToRollupKernelCircuitPublicInputs,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    include_by_timestamp_set_by_wallet: u64,
    hints: TailOutputHints,
}

impl TailOutputValidator {
    pub fn new(
        output: PrivateToRollupKernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        include_by_timestamp_set_by_wallet: u64,
    ) -> Self {
        // Safety: the below hints are constrained by calling validate(). See private_kernel_tail for use.
        let hints = unsafe { generate_tail_output_hints(previous_kernel) };

        TailOutputValidator::new_with_hints(
            output,
            previous_kernel,
            include_by_timestamp_set_by_wallet,
            hints,
        )
    }

    pub fn new_with_hints(
        output: PrivateToRollupKernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        include_by_timestamp_set_by_wallet: u64,
        hints: TailOutputHints,
    ) -> Self {
        TailOutputValidator { output, previous_kernel, include_by_timestamp_set_by_wallet, hints }
    }

    pub fn validate(self) {
        self.validate_propagated_values();
        self.validate_propagated_sorted_values();
        self.validate_gas_used();
    }

    fn validate_propagated_values(self) {
        // Whilst we could just assert the entire `constants` struct to be equal, we broke it
        // up to test with the specific error messages.
        assert_eq(
            self.output.constants.historical_header,
            self.previous_kernel.constants.historical_header,
            "mismatch historical_header",
        );
        assert_eq(
            self.output.constants.tx_context,
            self.previous_kernel.constants.tx_context,
            "mismatch tx_context",
        );
        assert_eq(
            self.output.constants.vk_tree_root,
            self.previous_kernel.constants.vk_tree_root,
            "mismatch vk_tree_root",
        );
        assert_eq(
            self.output.constants.protocol_contract_tree_root,
            self.previous_kernel.constants.protocol_contract_tree_root,
            "mismatch protocol_contract_tree_root",
        );

        assert_eq(self.output.fee_payer, self.previous_kernel.fee_payer, "mismatch fee_payer");

        // include_by_timestamp
        let include_by_timestamp = std::cmp::min(
            self.previous_kernel.include_by_timestamp,
            self.include_by_timestamp_set_by_wallet,
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

        // note_hashes
        let note_hashes = self.previous_kernel.end.note_hashes;
        for i in 0..note_hashes.array.len() {
            assert_eq(
                note_hashes.array[i].value(),
                self.output.end.note_hashes[i],
                "mismatch note_hashes",
            );
        }

        // nullifiers
        let nullifiers = self.previous_kernel.end.nullifiers;
        for i in 0..nullifiers.array.len() {
            assert_eq(
                nullifiers.array[i].value(),
                self.output.end.nullifiers[i],
                "mismatch nullifiers",
            );
        }

        // private_logs
        let private_logs = self.previous_kernel.end.private_logs;
        for i in 0..private_logs.array.len() {
            assert_eq(
                private_logs.array[i].expose_to_public(),
                self.output.end.private_logs[i],
                "mismatch private_logs",
            );
        }
    }

    fn validate_propagated_sorted_values(self) {
        // l2_to_l1_msgs
        assert_exposed_sorted_transformed_value_array(
            self.previous_kernel.end.l2_to_l1_msgs,
            self.output.end.l2_to_l1_msgs,
            |prev: Scoped<Counted<L2ToL1Message>>, out: Scoped<L2ToL1Message>| {
                assert_eq(out, prev.expose_to_public(), "mismatch l2_to_l1_msgs")
            },
            self.hints.sorted_l2_to_l1_msg_hints,
        );
        // contract_class_logs
        assert_exposed_sorted_transformed_value_array(
            self.previous_kernel.end.contract_class_logs_hashes,
            self.output.end.contract_class_logs_hashes,
            |prev: Scoped<Counted<LogHash>>, out: Scoped<LogHash>| {
                assert_eq(out, prev.expose_to_public(), "mismatch contract_class_logs_hashes")
            },
            self.hints.sorted_contract_class_log_hash_hints,
        );
    }

    fn validate_gas_used(self) {
        let gas_used = meter_gas_used(self.output.end);

        assert_eq(self.output.gas_used, gas_used, "incorrect metered gas used");

        let limits = self.previous_kernel.constants.tx_context.gas_settings.gas_limits;

        assert(self.output.gas_used.within(limits), "The gas used exceeds the gas limits");
    }
}
