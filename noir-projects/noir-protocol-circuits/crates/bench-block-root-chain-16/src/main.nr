use rollup_lib::bench::block_root::{execute_chain, BenchBlockRootChainOutput, BenchBlockRootChainPrivateInputs};

fn main(inputs: BenchBlockRootChainPrivateInputs<16>) -> pub BenchBlockRootChainOutput {
    execute_chain(inputs)
}
