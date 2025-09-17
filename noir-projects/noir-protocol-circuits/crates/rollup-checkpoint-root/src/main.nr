use dep::rollup_lib::checkpoint_root::{
    CheckpointRollupPublicInputs, CheckpointRootRollupPrivateInputs,
};

fn main(inputs: CheckpointRootRollupPrivateInputs) -> pub CheckpointRollupPublicInputs {
    inputs.execute()
}
