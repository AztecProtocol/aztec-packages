use rollup_lib::checkpoint_root::{
    checkpoint_root_rollup, CheckpointRollupPublicInputs, CheckpointRootRollupPrivateInputs,
};

fn main(inputs: CheckpointRootRollupPrivateInputs) -> pub CheckpointRollupPublicInputs {
    checkpoint_root_rollup::execute(inputs)
}
