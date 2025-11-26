mod validate_gas_used_tests;
mod validate_propagated_sorted_values_tests;
mod validate_propagated_values_tests;

use crate::components::{gas_meter::meter_gas_used, tail_output_validator::TailOutputValidator};
use super::TestBuilder;
use dep::types::abis::kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs;

impl TestBuilder {
    pub fn export_output(self) -> PrivateToRollupKernelCircuitPublicInputs {
        let mut output = self.output.to_private_to_rollup_kernel_circuit_public_inputs();
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        output.gas_used = meter_gas_used(previous_kernel, false);
        output
    }

    pub fn validate(self) {
        let output = self.export_output();
        self.validate_with_output(output);
    }

    pub fn validate_with_output(self, output: PrivateToRollupKernelCircuitPublicInputs) {
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        TailOutputValidator::new(
            output,
            previous_kernel,
            self.include_by_timestamp_upper_bound,
        )
            .validate();
    }
}
