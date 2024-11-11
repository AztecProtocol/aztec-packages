use crate::components::public_tail_output_composer::{
    generate_overridable_public_data_writes::generate_overridable_public_data_writes,
    generate_public_data_leaves::generate_public_data_leaves,
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
        public_data_write::OverridablePublicDataWrite,
    },
    constants::MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    data::{OverridablePublicDataTreeLeaf, PublicDataLeafHint},
    utils::arrays::array_merge,
};

pub struct OutputHints<let NUM_PUBLIC_DATA_LEAVES: u32> {
    public_data_writes: [OverridablePublicDataWrite; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_PUBLIC_DATA_LEAVES],
}

pub unconstrained fn generate_output_hints<let NUM_PUBLIC_DATA_LEAVES: u32>(
    previous_kernel: PublicKernelCircuitPublicInputs,
    public_data_leaf_hints: [PublicDataLeafHint; NUM_PUBLIC_DATA_LEAVES],
) -> OutputHints<NUM_PUBLIC_DATA_LEAVES> {
    let combined_writes = array_merge(
        previous_kernel.end_non_revertible.public_data_update_requests,
        previous_kernel.end.public_data_update_requests,
    );
    let public_data_leaves = generate_public_data_leaves(
        previous_kernel.validation_requests.public_data_reads,
        combined_writes,
        public_data_leaf_hints,
    );
    let public_data_writes =
        generate_overridable_public_data_writes(combined_writes, public_data_leaves);

    OutputHints { public_data_writes, public_data_leaves }
}
