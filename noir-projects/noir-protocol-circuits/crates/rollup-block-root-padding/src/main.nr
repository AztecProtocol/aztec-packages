use rollup_lib::block_root::{BlockRootOrBlockMergePublicInputs, PaddingBlockRootRollupInputs};

fn main(inputs: PaddingBlockRootRollupInputs) -> pub BlockRootOrBlockMergePublicInputs {
    inputs.execute()
}
