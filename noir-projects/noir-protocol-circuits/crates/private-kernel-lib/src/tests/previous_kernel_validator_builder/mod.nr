mod validate_no_transient_data;

use crate::components::previous_kernel_validator::PreviousKernelValidator;
use dep::types::tests::fixture_builder::FixtureBuilder;

pub struct PreviousKernelValidatorBuilder {
    previous_kernel: FixtureBuilder,
}

impl PreviousKernelValidatorBuilder {
    pub fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new();
        previous_kernel.set_protocol_nullifier();
        PreviousKernelValidatorBuilder { previous_kernel }
    }

    pub fn validate_for_private_tail(self) {
        let previous_kernel = self.previous_kernel.to_private_kernel_data();
        PreviousKernelValidator::new(previous_kernel).validate_for_private_tail();
    }
}

// TODO: Add tests.
