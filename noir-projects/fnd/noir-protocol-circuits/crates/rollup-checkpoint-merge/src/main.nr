use rollup_lib::checkpoint_merge::{
    checkpoint_merge_rollup, CheckpointMergeRollupPrivateInputs, CheckpointRollupPublicInputs,
};

fn main(inputs: CheckpointMergeRollupPrivateInputs) -> pub CheckpointRollupPublicInputs {
    checkpoint_merge_rollup::execute(inputs)
}
