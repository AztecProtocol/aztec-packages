mod meter_gas_used;
mod split_to_public;
mod tail_to_public_output_composer;

use crate::{
    abis::PaddedSideEffectAmounts,
    components::tail_to_public_output_composer::TailToPublicOutputComposer,
};
use dep::types::{
    abis::kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    tests::fixture_builder::FixtureBuilder, traits::Empty,
};

pub struct TailToPublicOutputComposerBuilder {
    previous_kernel: FixtureBuilder,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    include_by_timestamp_upper_bound: u64,
}

impl TailToPublicOutputComposerBuilder {
    pub fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new();
        previous_kernel.set_protocol_nullifier(); // Need the first nullifier to silo note hashes.

        let padded_side_effect_amounts = PaddedSideEffectAmounts::empty();

        TailToPublicOutputComposerBuilder {
            previous_kernel,
            padded_side_effect_amounts,
            include_by_timestamp_upper_bound: previous_kernel.include_by_timestamp,
        }
    }

    pub fn finish(self) -> PrivateToPublicKernelCircuitPublicInputs {
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        // Safety: This is only used in tests.
        unsafe {
            let composer = TailToPublicOutputComposer::new(
                previous_kernel,
                self.padded_side_effect_amounts,
                self.include_by_timestamp_upper_bound,
            );
            composer.finish()
        }
    }
}
