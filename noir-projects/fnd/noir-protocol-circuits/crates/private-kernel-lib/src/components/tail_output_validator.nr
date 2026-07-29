use crate::{
    accumulated_data::{assert_sorted_transformed_array, assert_transformed_array},
    components::gas_meter::meter_gas_used,
};

use types::{
    abis::kernel_circuit_public_inputs::{
        PrivateKernelCircuitPublicInputs, PrivateToRollupKernelCircuitPublicInputs,
    },
    constants::MAX_TX_LIFETIME,
};

pub struct TailOutputValidator {
    output: PrivateToRollupKernelCircuitPublicInputs,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    expiration_timestamp_upper_bound: u64,
}

impl TailOutputValidator {
    pub fn new(
        output: PrivateToRollupKernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        expiration_timestamp_upper_bound: u64,
    ) -> Self {
        TailOutputValidator { output, previous_kernel, expiration_timestamp_upper_bound }
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
            self.output.constants.anchor_block_header,
            self.previous_kernel.constants.anchor_block_header,
            "mismatch anchor_block_header",
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
            self.output.constants.protocol_contracts_hash,
            self.previous_kernel.constants.protocol_contracts.hash(),
            "mismatch protocol_contracts_hash",
        );

        assert_eq(self.output.fee_payer, self.previous_kernel.fee_payer, "mismatch fee_payer");

        // `expiration_timestamp` - The timestamp at which the transaction expires.
        // This value can only decrease with each iteration. Here we take the minimum of:
        // - The value from the previous kernel iteration
        // - An upper bound value set by the user
        let max_timestamp = self
            .previous_kernel
            .constants
            .anchor_block_header
            .global_variables
            .timestamp
            + MAX_TX_LIFETIME;
        let expiration_timestamp = std::cmp::min(
            std::cmp::min(
                self.previous_kernel.expiration_timestamp,
                self.expiration_timestamp_upper_bound,
            ),
            max_timestamp,
        );

        assert_eq(
            self.output.expiration_timestamp,
            expiration_timestamp,
            "incorrect expiration_timestamp",
        );

        // note_hashes
        assert_transformed_array(
            self.previous_kernel.end.note_hashes,
            self.output.end.note_hashes,
            |prev, out| assert_eq(out, prev.expose_to_public(), "mismatch note_hashes"),
        );

        // nullifiers
        assert_transformed_array(
            self.previous_kernel.end.nullifiers,
            self.output.end.nullifiers,
            |prev, out| assert_eq(out, prev.expose_to_public(), "mismatch nullifiers"),
        );

        // private_logs
        assert_transformed_array(
            self.previous_kernel.end.private_logs,
            self.output.end.private_logs,
            |prev, out| assert_eq(out, prev.expose_to_public(), "mismatch private_logs"),
        );
    }

    fn validate_propagated_sorted_values(self) {
        // l2_to_l1_msgs
        assert_sorted_transformed_array(
            self.previous_kernel.end.l2_to_l1_msgs,
            self.output.end.l2_to_l1_msgs,
            |prev, out| assert_eq(out, prev.expose_to_public(), "mismatch l2_to_l1_msgs"),
        );

        // contract_class_logs
        assert_sorted_transformed_array(
            self.previous_kernel.end.contract_class_logs_hashes,
            self.output.end.contract_class_logs_hashes,
            |prev, out| {
                assert_eq(out, prev.expose_to_public(), "mismatch contract_class_logs_hashes")
            },
        );
    }

    fn validate_gas_used(self) {
        let gas_used = meter_gas_used(self.previous_kernel, false);
        assert_eq(self.output.gas_used, gas_used, "incorrect metered gas used");

        let limits = self.previous_kernel.constants.tx_context.gas_settings.gas_limits;
        assert(self.output.gas_used.within(limits), "The gas used exceeds the gas limits");
    }
}
