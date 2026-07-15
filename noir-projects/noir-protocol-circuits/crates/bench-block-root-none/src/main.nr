use rollup_lib::bench::block_root::{execute_none, BenchBlockRootNonePrivateInputs};
use rollup_lib::block_root::BlockRollupPublicInputs;

fn main(inputs: BenchBlockRootNonePrivateInputs) -> pub BlockRollupPublicInputs {
    execute_none(inputs)
}
