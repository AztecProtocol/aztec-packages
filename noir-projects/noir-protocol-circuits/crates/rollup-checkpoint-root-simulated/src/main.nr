use dep::rollup_lib::checkpoint_root::{
    CheckpointRollupPublicInputs, CheckpointRootRollupPrivateInputs,
};

unconstrained fn main(
    inputs: CheckpointRootRollupPrivateInputs,
) -> pub CheckpointRollupPublicInputs {
    inputs.execute()
}
