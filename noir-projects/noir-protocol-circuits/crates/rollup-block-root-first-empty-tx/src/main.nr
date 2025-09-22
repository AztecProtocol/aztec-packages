use rollup_lib::block_root::{BlockRollupPublicInputs, BlockRootEmptyTxFirstRollupPrivateInputs};

fn main(inputs: BlockRootEmptyTxFirstRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
