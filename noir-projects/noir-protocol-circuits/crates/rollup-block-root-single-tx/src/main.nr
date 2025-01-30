use dep::rollup_lib::block_root::{BlockRootOrBlockMergePublicInputs, SingleTxBlockRootRollupInputs};

fn main(inputs: SingleTxBlockRootRollupInputs) -> pub BlockRootOrBlockMergePublicInputs {
    inputs.execute()
}
