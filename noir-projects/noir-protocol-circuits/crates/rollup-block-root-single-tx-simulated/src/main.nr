use dep::rollup_lib::block_root::{BlockRootOrBlockMergePublicInputs, SingleTxBlockRootRollupInputs};

unconstrained fn main(
    inputs: SingleTxBlockRootRollupInputs,
) -> pub BlockRootOrBlockMergePublicInputs {
    inputs.execute()
}
