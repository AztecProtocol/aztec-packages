use dep::rollup_lib::block_root::{
    BlockRollupPublicInputs, BlockRootSingleTxFirstRollupPrivateInputs,
};

unconstrained fn main(
    inputs: BlockRootSingleTxFirstRollupPrivateInputs,
) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
