use rollup_lib::bench::checkpoint_root::{execute_noparity, BenchCheckpointRootNoParityPrivateInputs};
use rollup_lib::checkpoint_root::CheckpointRollupPublicInputs;

fn main(inputs: BenchCheckpointRootNoParityPrivateInputs) -> pub CheckpointRollupPublicInputs {
    execute_noparity(inputs)
}
