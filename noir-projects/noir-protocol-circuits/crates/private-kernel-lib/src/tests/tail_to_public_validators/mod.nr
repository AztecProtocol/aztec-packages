// Tests for public-bound terminal tail validation helpers.

mod output_composition_tests;
mod previous_kernel_validation_tests;
mod tail_to_public_output_validator;

use crate::abis::PaddedSideEffectAmounts;
use crate::components::{
    previous_kernel_for_tail_validator::validate_previous_kernel_for_tail,
    tail_to_public_finalize::tail_to_public_finalize,
};
use protocol_test_utils::FixtureBuilder;
use types::{
    abis::{gas::Gas, kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs},
    address::AztecAddress,
    constants::PRIVATE_KERNEL_INNER_VK_INDEX,
    traits::{Empty, FromField},
};

pub struct TestBuilder {
    pub previous_kernel: FixtureBuilder,
    pub padded_side_effect_amounts: PaddedSideEffectAmounts,
    pub expiration_timestamp_upper_bound: u64,
    // Used by tail_to_public_output_validator/* tests to construct an expected output and
    // drive `TailToPublicOutputValidator` directly.
    pub output: FixtureBuilder,
}

impl TestBuilder {
    pub fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new().in_vk_tree(PRIVATE_KERNEL_INNER_VK_INDEX);
        previous_kernel.tx_context.gas_settings.gas_limits = Gas::new(1_000_000_000, 1_000_000_000);
        previous_kernel.append_siloed_nullifiers(1);
        previous_kernel.set_fee_payer(AztecAddress::from_field(234234));
        previous_kernel.end_setup();
        previous_kernel.append_public_call_requests(1);

        let padded_side_effect_amounts = PaddedSideEffectAmounts::empty();

        let output = previous_kernel;

        TestBuilder {
            previous_kernel,
            padded_side_effect_amounts,
            expiration_timestamp_upper_bound: previous_kernel.expiration_timestamp,
            output,
        }
    }

    pub fn execute(self) -> PrivateToPublicKernelCircuitPublicInputs {
        let previous_kernel_pi = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        validate_previous_kernel_for_tail(previous_kernel_pi, true /* is_for_public */);
        tail_to_public_finalize(
            previous_kernel_pi,
            self.padded_side_effect_amounts,
            self.expiration_timestamp_upper_bound,
        )
    }
}
