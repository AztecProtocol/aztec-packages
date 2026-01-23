use dep::rollup_lib::block_root::{
    block_root_single_tx_rollup, BlockRollupPublicInputs, BlockRootSingleTxRollupPrivateInputs,
};

fn main(inputs: BlockRootSingleTxRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    block_root_single_tx_rollup::execute(inputs)
}
