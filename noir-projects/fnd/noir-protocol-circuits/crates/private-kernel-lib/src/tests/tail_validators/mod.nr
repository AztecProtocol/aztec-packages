// Tests for rollup-bound terminal tail validation helpers.

mod previous_kernel_validation_tests;
mod tail_output_validator;

use crate::components::{
    previous_kernel_for_tail_validator::validate_previous_kernel_for_tail,
    tail_finalize::tail_finalize,
};
use protocol_test_utils::FixtureBuilder;
use types::{
    abis::{gas::Gas, kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs},
    address::AztecAddress,
    constants::PRIVATE_KERNEL_INNER_VK_INDEX,
    traits::FromField,
};

pub struct TestBuilder {
    pub previous_kernel: FixtureBuilder,
    pub expiration_timestamp_upper_bound: u64,
    pub output: FixtureBuilder,
}

impl TestBuilder {
    pub fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new().in_vk_tree(PRIVATE_KERNEL_INNER_VK_INDEX);
        previous_kernel.tx_context.gas_settings.gas_limits = Gas::new(1_000_000_000, 1_000_000_000);
        previous_kernel.append_siloed_nullifiers(1);
        previous_kernel.set_fee_payer(AztecAddress::from_field(234234));
        previous_kernel.is_private_only = true;

        let output = previous_kernel;

        TestBuilder {
            previous_kernel,
            expiration_timestamp_upper_bound: previous_kernel.expiration_timestamp,
            output,
        }
    }

    pub fn execute(self) -> PrivateToRollupKernelCircuitPublicInputs {
        let previous_kernel_pi = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        validate_previous_kernel_for_tail(previous_kernel_pi, false /* is_for_public */);
        tail_finalize(previous_kernel_pi, self.expiration_timestamp_upper_bound)
    }
}
