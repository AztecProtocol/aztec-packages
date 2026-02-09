use ::rollup_lib::block_root::{
    block_root_single_tx_rollup, BlockRollupPublicInputs, BlockRootSingleTxRollupPrivateInputs,
};

unconstrained fn main(inputs: BlockRootSingleTxRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    block_root_single_tx_rollup::execute(inputs)
}
