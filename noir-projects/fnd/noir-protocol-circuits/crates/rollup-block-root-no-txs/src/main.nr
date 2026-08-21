use rollup_lib::block_root::{
    block_root_no_txs_rollup, BlockRollupPublicInputs, BlockRootNoTxsRollupPrivateInputs,
};

fn main(inputs: BlockRootNoTxsRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    block_root_no_txs_rollup::execute(inputs)
}
