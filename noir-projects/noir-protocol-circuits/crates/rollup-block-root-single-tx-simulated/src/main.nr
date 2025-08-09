use dep::rollup_lib::block_root::{BlockRollupPublicInputs, BlockRootSingleTxRollupPrivateInputs};

unconstrained fn main(inputs: BlockRootSingleTxRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
