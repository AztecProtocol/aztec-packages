use dep::rollup_lib::checkpoint_root::{
    checkpoint_root_single_block_rollup, CheckpointRollupPublicInputs,
    CheckpointRootSingleBlockRollupPrivateInputs,
};

unconstrained fn main(
    inputs: CheckpointRootSingleBlockRollupPrivateInputs,
) -> pub CheckpointRollupPublicInputs {
    checkpoint_root_single_block_rollup::execute(inputs)
}
