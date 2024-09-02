mod combine_data;
mod generate_overridable_public_data_writes;
mod generate_public_data_leaves;

use crate::components::public_tail_output_composer::{
    combine_data::combine_data,
    generate_overridable_public_data_writes::{generate_overridable_public_data_writes, LinkedIndexHint},
    generate_public_data_leaves::generate_public_data_leaves
};
use dep::types::{
    abis::{
    kernel_circuit_public_inputs::{KernelCircuitPublicInputs, PublicKernelCircuitPublicInputs},
    public_data_write::OverridablePublicDataWrite
},
    constants::MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    data::{OverridablePublicDataTreeLeaf, PublicDataLeafHint},
    partial_state_reference::PartialStateReference, utils::arrays::array_merge
};

struct PublicTailOutputComposer<let NUM_HINTS: u32> {
    previous_kernel: PublicKernelCircuitPublicInputs,
    start_state: PartialStateReference,
    public_data_writes: [OverridablePublicDataWrite; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_HINTS],
    public_data_linked_index_hints: [LinkedIndexHint; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
}

impl<let NUM_HINTS: u32> PublicTailOutputComposer<NUM_HINTS> {
    pub fn new(
        previous_kernel: PublicKernelCircuitPublicInputs,
        start_state: PartialStateReference,
        public_data_leaf_hints: [PublicDataLeafHint; NUM_HINTS]
    ) -> Self {
        let combined_writes = array_merge(
            previous_kernel.end_non_revertible.public_data_update_requests,
            previous_kernel.end.public_data_update_requests
        );
        let public_data_leaves = generate_public_data_leaves(
            previous_kernel.validation_requests.public_data_reads,
            combined_writes,
            public_data_leaf_hints
        );
        let (public_data_writes, public_data_linked_index_hints) = generate_overridable_public_data_writes(combined_writes, public_data_leaves);
        PublicTailOutputComposer { previous_kernel, start_state, public_data_writes, public_data_leaves, public_data_linked_index_hints }
    }

    pub fn finish(self) -> KernelCircuitPublicInputs {
        let end = combine_data(
            self.previous_kernel.end_non_revertible,
            self.previous_kernel.end,
            self.public_data_writes
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
