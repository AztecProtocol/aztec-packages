use crate::{
    abis::PaddedSideEffectAmounts,
    components::{
        previous_kernel_validator::PreviousKernelDenseTrimmedArrays,
        tail_to_public_output_validator::TailToPublicOutputValidator,
    },
};
use dep::types::{tests::fixture_builder::FixtureBuilder, traits::Empty};

pub(crate) struct TailToPublicOutputValidatorBuilder {
    pub(crate) output: FixtureBuilder,
    pub(crate) previous_kernel: FixtureBuilder,
    pub(crate) padded_side_effect_amounts: PaddedSideEffectAmounts,
}

impl TailToPublicOutputValidatorBuilder {
    pub(crate) fn new() -> Self {
        let mut output = FixtureBuilder::new();
        let mut previous_kernel = FixtureBuilder::new();
        let padded_side_effect_amounts = PaddedSideEffectAmounts::empty();
        output.set_protocol_nullifier();
        previous_kernel.set_protocol_nullifier();
        TailToPublicOutputValidatorBuilder { output, previous_kernel, padded_side_effect_amounts }
    }

    pub(crate) fn validate(self) {
        let output = self.output.to_private_to_public_kernel_circuit_public_inputs();

        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();

        TailToPublicOutputValidator::new(
            output,
            previous_kernel,
            PreviousKernelDenseTrimmedArrays::empty(),
            self.padded_side_effect_amounts,
        )
            .validate();
    }
}

// TODO: Add tests.
