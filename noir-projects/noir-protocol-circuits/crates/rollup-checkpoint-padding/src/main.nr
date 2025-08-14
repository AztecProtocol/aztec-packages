use dep::rollup_lib::checkpoint_root::{
    CheckpointPaddingRollupPrivateInputs, CheckpointRollupPublicInputs,
};

fn main(inputs: CheckpointPaddingRollupPrivateInputs) -> pub CheckpointRollupPublicInputs {
    inputs.execute()
}
