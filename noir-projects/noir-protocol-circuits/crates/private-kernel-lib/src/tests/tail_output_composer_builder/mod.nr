mod meter_gas_used;

use crate::components::tail_output_composer::TailOutputComposer;
use dep::types::{
    abis::kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
    tests::fixture_builder::FixtureBuilder,
};

pub struct TailOutputComposerBuilder {
    previous_kernel: FixtureBuilder,
    include_by_timestamp_upper_bound: u64,
}

impl TailOutputComposerBuilder {
    pub fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new();
        previous_kernel.set_protocol_nullifier(); // Need the first nullifier to silo note hashes.

        let include_by_timestamp_upper_bound = previous_kernel.include_by_timestamp;

        TailOutputComposerBuilder { previous_kernel, include_by_timestamp_upper_bound }
    }

    pub fn finish(self) -> PrivateToRollupKernelCircuitPublicInputs {
        let previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();
        // Safety: This is only used in tests.
        unsafe {
            let composer =
                TailOutputComposer::new(previous_kernel, self.include_by_timestamp_upper_bound);
            composer.finish()
        }
    }
}

// TODO: Add tests.
