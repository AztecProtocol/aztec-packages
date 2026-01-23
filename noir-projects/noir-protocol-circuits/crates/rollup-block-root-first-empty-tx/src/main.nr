use rollup_lib::block_root::{
    block_root_empty_tx_first_rollup, BlockRollupPublicInputs,
    BlockRootEmptyTxFirstRollupPrivateInputs,
};

fn main(inputs: BlockRootEmptyTxFirstRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    block_root_empty_tx_first_rollup::execute(inputs)
}
