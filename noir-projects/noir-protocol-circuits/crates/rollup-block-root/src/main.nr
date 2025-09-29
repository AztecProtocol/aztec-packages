use dep::rollup_lib::block_root::{BlockRollupPublicInputs, BlockRootRollupPrivateInputs};

fn main(inputs: BlockRootRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
