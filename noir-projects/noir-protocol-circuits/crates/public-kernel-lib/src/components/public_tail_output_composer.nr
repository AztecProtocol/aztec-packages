mod combine_data;
mod generate_output_hints;
mod generate_overridable_public_data_writes;
mod generate_public_data_leaves;

pub use generate_output_hints::{OutputHints, SiloedNoteHashHint};
pub use generate_overridable_public_data_writes::LinkedIndexHint;

use crate::components::public_tail_output_composer::{
    combine_data::combine_data, generate_output_hints::generate_output_hints,
};
use dep::types::{
    abis::kernel_circuit_public_inputs::{
        KernelCircuitPublicInputs, PublicKernelCircuitPublicInputs,
    },
    data::PublicDataLeafHint,
    partial_state_reference::PartialStateReference,
};

pub struct PublicTailOutputComposer<let NUM_PUBLIC_DATA_LEAVES: u32> {
    previous_kernel: PublicKernelCircuitPublicInputs,
    start_state: PartialStateReference,
    public_data_leaf_hints: [PublicDataLeafHint; NUM_PUBLIC_DATA_LEAVES],
}

impl<let NUM_PUBLIC_DATA_LEAVES: u32> PublicTailOutputComposer<NUM_PUBLIC_DATA_LEAVES> {
    pub unconstrained fn new(
        previous_kernel: PublicKernelCircuitPublicInputs,
        start_state: PartialStateReference,
        public_data_leaf_hints: [PublicDataLeafHint; NUM_PUBLIC_DATA_LEAVES],
    ) -> Self {
        PublicTailOutputComposer { previous_kernel, start_state, public_data_leaf_hints }
    }

    pub unconstrained fn finish(
        self,
    ) -> (KernelCircuitPublicInputs, OutputHints<NUM_PUBLIC_DATA_LEAVES>) {
        let output_hints = generate_output_hints(self.previous_kernel, self.public_data_leaf_hints);

        let end = combine_data(
            self.previous_kernel.end_non_revertible,
            self.previous_kernel.end,
            output_hints,
        );

        (
            KernelCircuitPublicInputs {
                rollup_validation_requests: self.previous_kernel.validation_requests.for_rollup,
                end,
                constants: self.previous_kernel.constants,
                start_state: self.start_state,
                revert_code: self.previous_kernel.revert_code,
                fee_payer: self.previous_kernel.fee_payer,
            }, output_hints,
        )
    }
}
