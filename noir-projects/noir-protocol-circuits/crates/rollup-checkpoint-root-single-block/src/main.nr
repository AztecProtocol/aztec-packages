use dep::rollup_lib::checkpoint_root::{
    CheckpointRollupPublicInputs, CheckpointRootSingleBlockRollupPrivateInputs,
};

fn main(inputs: CheckpointRootSingleBlockRollupPrivateInputs) -> pub CheckpointRollupPublicInputs {
    inputs.execute()
}
