use rollup_lib::bench::checkpoint_root::{execute_inline, BenchCheckpointRootInlinePrivateInputs};
use rollup_lib::checkpoint_root::CheckpointRollupPublicInputs;

fn main(inputs: BenchCheckpointRootInlinePrivateInputs<1024>) -> pub CheckpointRollupPublicInputs {
    execute_inline(inputs)
}
