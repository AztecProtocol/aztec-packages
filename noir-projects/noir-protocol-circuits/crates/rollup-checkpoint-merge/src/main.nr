use dep::rollup_lib::checkpoint_merge::{
    CheckpointMergeRollupPrivateInputs, CheckpointRollupPublicInputs,
};

fn main(inputs: CheckpointMergeRollupPrivateInputs) -> pub CheckpointRollupPublicInputs {
    inputs.execute()
}
