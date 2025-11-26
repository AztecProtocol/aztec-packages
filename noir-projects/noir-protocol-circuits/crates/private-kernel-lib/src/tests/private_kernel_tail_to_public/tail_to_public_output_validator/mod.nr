mod validate_gas_used_tests;
mod validate_propagated_sorted_values_tests;
mod validate_propagated_split_values_tests;
mod validate_propagated_values_tests;

use crate::components::{
    gas_meter::meter_gas_used, tail_to_public_output_validator::TailToPublicOutputValidator,
};
use super::TestBuilder;
use dep::types::abis::kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs;

impl TestBuilder {
    pub fn export_output(self) -> PrivateToPublicKernelCircuitPublicInputs {
        let mut output = self.output.to_private_to_public_kernel_circuit_public_inputs();
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        output.gas_used = meter_gas_used(previous_kernel, true /* is_for_public */);
        output
    }

    pub fn validate(self) {
        let output = self.export_output();
        self.validate_with_output(output);
    }

    pub fn validate_with_output(self, output: PrivateToPublicKernelCircuitPublicInputs) {
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        TailToPublicOutputValidator::new(
            output,
            previous_kernel,
            self.padded_side_effect_amounts,
            self.include_by_timestamp_upper_bound,
        )
            .validate();
    }
}
