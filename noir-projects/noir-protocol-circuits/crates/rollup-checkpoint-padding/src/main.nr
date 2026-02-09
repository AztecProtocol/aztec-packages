use ::rollup_lib::checkpoint_root::{
    checkpoint_padding_rollup, CheckpointPaddingRollupPrivateInputs, CheckpointRollupPublicInputs,
};

fn main(inputs: CheckpointPaddingRollupPrivateInputs) -> pub CheckpointRollupPublicInputs {
    checkpoint_padding_rollup::execute(inputs)
}
