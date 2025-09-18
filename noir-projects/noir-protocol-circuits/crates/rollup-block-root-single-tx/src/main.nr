use dep::rollup_lib::block_root::{BlockRollupPublicInputs, BlockRootSingleTxRollupPrivateInputs};

fn main(inputs: BlockRootSingleTxRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
