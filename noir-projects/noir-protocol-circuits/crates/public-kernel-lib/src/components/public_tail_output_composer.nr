mod combine_data;
mod generate_combined_overridable_public_data_writes;

use crate::components::public_tail_output_composer::{
    combine_data::combine_data,
    generate_combined_overridable_public_data_writes::generate_combined_overridable_public_data_writes
};
use dep::types::{
    abis::{
    kernel_circuit_public_inputs::{KernelCircuitPublicInputs, PublicKernelCircuitPublicInputs},
    public_data_write::OverridablePublicDataWrite
},
    constants::MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, partial_state_reference::PartialStateReference
};

struct PublicTailOutputComposer {
    previous_kernel: PublicKernelCircuitPublicInputs,
    start_state: PartialStateReference,
    overridable_public_data_writes: [OverridablePublicDataWrite; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
}

impl PublicTailOutputComposer {
    pub fn new(
        previous_kernel: PublicKernelCircuitPublicInputs,
        start_state: PartialStateReference
    ) -> Self {
        let overridable_public_data_writes = generate_combined_overridable_public_data_writes(
            previous_kernel.end_non_revertible.public_data_update_requests,
            previous_kernel.end.public_data_update_requests
        );
        PublicTailOutputComposer { previous_kernel, start_state, overridable_public_data_writes }
    }

    pub fn finish(self) -> KernelCircuitPublicInputs {
        let end = combine_data(
            self.previous_kernel.end_non_revertible,
            self.previous_kernel.end,
            self.overridable_public_data_writes
        );

        KernelCircuitPublicInputs {
            rollup_validation_requests: self.previous_kernel.validation_requests.for_rollup,
            end,
            constants: self.previous_kernel.constants,
            start_state: self.start_state,
            revert_code: self.previous_kernel.revert_code,
            fee_payer: self.previous_kernel.fee_payer
        }
    }
}
