use rollup_lib::bench::block_root::{execute_sponge, BenchBlockRootSpongePrivateInputs};
use rollup_lib::block_root::BlockRollupPublicInputs;

fn main(inputs: BenchBlockRootSpongePrivateInputs) -> pub BlockRollupPublicInputs {
    execute_sponge(inputs)
}
