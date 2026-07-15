use rollup_lib::bench::block_root::{execute_chain, BenchBlockRootChainOutput, BenchBlockRootChainPrivateInputs};

fn main(inputs: BenchBlockRootChainPrivateInputs<64>) -> pub BenchBlockRootChainOutput {
    execute_chain(inputs)
}
