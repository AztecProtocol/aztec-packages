mod validate_accumulated_values;
mod validate_empty_values;
mod validate_propagated_sorted_siloed_values;
mod validate_propagated_values;

use crate::components::kernel_circuit_output_validator::KernelCircuitOutputValidator;
use dep::types::tests::fixture_builder::FixtureBuilder;

struct KernelCircuitOutputValidatorBuilder {
    output: FixtureBuilder,
    previous_kernel: FixtureBuilder
}

impl KernelCircuitOutputValidatorBuilder {
    pub fn new() -> Self {
        let mut output = FixtureBuilder::new();
        let mut previous_kernel = FixtureBuilder::new();
        output.set_first_nullifier();
        previous_kernel.set_first_nullifier();
        KernelCircuitOutputValidatorBuilder { output, previous_kernel }
    }

    pub fn validate(self) {
        let output = self.output.to_kernel_circuit_public_inputs();
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        KernelCircuitOutputValidator::new(output, previous_kernel).validate();
    }
}
