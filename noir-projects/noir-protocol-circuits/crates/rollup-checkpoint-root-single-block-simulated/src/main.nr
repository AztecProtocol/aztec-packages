use dep::rollup_lib::checkpoint_root::{
    CheckpointRollupPublicInputs, CheckpointRootSingleBlockRollupPrivateInputs,
};

unconstrained fn main(
    inputs: CheckpointRootSingleBlockRollupPrivateInputs,
) -> pub CheckpointRollupPublicInputs {
    inputs.execute()
}
