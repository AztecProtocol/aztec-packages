use ::rollup_lib::block_root::{
    block_root_single_tx_first_rollup, BlockRollupPublicInputs,
    BlockRootSingleTxFirstRollupPrivateInputs,
};

fn main(inputs: BlockRootSingleTxFirstRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    block_root_single_tx_first_rollup::execute(inputs)
}
