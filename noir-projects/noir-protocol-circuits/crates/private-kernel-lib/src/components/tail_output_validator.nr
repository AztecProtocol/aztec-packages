pub mod tail_output_hints;

use crate::components::tail_output_composer::meter_gas_used;
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::{KernelCircuitPublicInputs, PrivateKernelCircuitPublicInputs},
        log_hash::ScopedLogHash,
        private_log::PrivateLogData,
        side_effect::scoped::Scoped,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    traits::{is_empty, is_empty_array},
    utils::arrays::assert_exposed_sorted_transformed_value_array,
};
use tail_output_hints::{generate_tail_output_hints, TailOutputHints};

pub struct TailOutputValidator {
    output: KernelCircuitPublicInputs,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    hints: TailOutputHints,
}

impl TailOutputValidator {
    pub fn new(
        output: KernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
    ) -> Self {
        let hints = unsafe { generate_tail_output_hints(previous_kernel) };
        TailOutputValidator::new_with_hints(output, previous_kernel, hints)
    }

    pub fn new_with_hints(
        output: KernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        hints: TailOutputHints,
    ) -> Self {
        TailOutputValidator { output, previous_kernel, hints }
    }

    pub fn validate(self) {
        self.validate_empty_values();
        self.validate_propagated_values();
        self.validate_propagated_sorted_values();
        self.validate_gas_used();
    }

    fn validate_empty_values(self) {
        assert(is_empty(self.output.start_state), "start_state must be empty");
        assert_eq(self.output.revert_code, 0, "revert_code must be empty");
        assert(
            is_empty_array(self.output.end.unencrypted_logs_hashes),
            "unencrypted logs in private must be empty",
        );
    }

    fn validate_propagated_values(self) {
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
        assert(is_empty(self.output.constants.global_variables), "global_variables must be empty");

        assert_eq(
            self.output.rollup_validation_requests,
            self.previous_kernel.validation_requests.for_rollup,
            "mismatch rollup_validation_requests",
        );

        assert_eq(self.output.fee_payer, self.previous_kernel.fee_payer, "mismatch fee_payer");

        // note_hashes
        let note_hashes = self.previous_kernel.end.note_hashes;
        for i in 0..note_hashes.len() {
            assert_eq(
                note_hashes[i].value(),
                self.output.end.note_hashes[i],
                "mismatch note_hashes",
            );
        }

        // nullifiers
        let nullifiers = self.previous_kernel.end.nullifiers;
        for i in 0..nullifiers.len() {
            assert_eq(nullifiers[i].value(), self.output.end.nullifiers[i], "mismatch nullifiers");
        }

        // private_logs
        assert_eq(
            self.previous_kernel.end.private_logs.map(|l: Scoped<PrivateLogData>| l.inner.log),
            self.output.end.private_logs,
            "mismatch private_logs",
        );
    }

    fn validate_propagated_sorted_values(self) {
        // l2_to_l1_msgs
        assert_exposed_sorted_transformed_value_array(
            self.previous_kernel.end.l2_to_l1_msgs,
            self.output.end.l2_to_l1_msgs,
            |prev: ScopedL2ToL1Message, out: ScopedL2ToL1Message| out == prev.expose_to_public(),
            self.hints.sorted_l2_to_l1_msg_hints,
        );
        // contract_class_logs
        assert_exposed_sorted_transformed_value_array(
            self.previous_kernel.end.contract_class_logs_hashes,
            self.output.end.contract_class_logs_hashes,
            |prev: ScopedLogHash, out: ScopedLogHash| out == prev.expose_to_public(),
            self.hints.sorted_contract_class_log_hash_hints,
        );
    }

    fn validate_gas_used(self) {
        let gas_used = meter_gas_used(self.output.end);
        assert(self.output.gas_used == gas_used, "incorrect metered gas used");

        let limits = self.previous_kernel.constants.tx_context.gas_settings.gas_limits;
        assert(self.output.gas_used.within(limits), "The gas used exceeds the gas limits");
    }
}
