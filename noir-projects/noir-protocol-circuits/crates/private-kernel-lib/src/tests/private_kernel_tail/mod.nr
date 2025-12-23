mod meter_gas_used_tests;
mod output_composition_tests;
mod previous_kernel_validation_tests;
mod tail_output_validator;

use crate::private_kernel_tail::{self, PrivateKernelTailCircuitPrivateInputs};
use dep::types::{
    abis::{gas::Gas, kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs},
    address::AztecAddress,
    constants::PRIVATE_KERNEL_INNER_VK_INDEX,
    tests::fixture_builder::FixtureBuilder,
    traits::FromField,
};

struct TestBuilder {
    pub previous_kernel: FixtureBuilder,
    pub include_by_timestamp_upper_bound: u64,
    pub output: FixtureBuilder,
}

impl TestBuilder {
    pub fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new().in_vk_tree(PRIVATE_KERNEL_INNER_VK_INDEX);
        previous_kernel.tx_context.gas_settings.gas_limits = Gas::new(1_000_000_000, 1_000_000_000);
        previous_kernel.append_siloed_nullifiers(1);
        previous_kernel.claimed_first_nullifier =
            previous_kernel.nullifiers.get(0).innermost().value;
        previous_kernel.set_fee_payer(AztecAddress::from_field(234234));
        previous_kernel.is_private_only = true;

        let output = previous_kernel;

        TestBuilder {
            previous_kernel,
            include_by_timestamp_upper_bound: previous_kernel.include_by_timestamp,
            output,
        }
    }

    pub fn execute(self) -> PrivateToRollupKernelCircuitPublicInputs {
        let previous_kernel = self.previous_kernel.to_private_kernel_data();

        let inputs = PrivateKernelTailCircuitPrivateInputs {
            previous_kernel,
            include_by_timestamp_upper_bound: self.include_by_timestamp_upper_bound,
        };

        private_kernel_tail::execute(inputs)
    }
}
