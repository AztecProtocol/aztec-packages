use rollup_lib::block_root::{BlockRootOrBlockMergePublicInputs, EmptyBlockRootRollupInputs};

fn main(inputs: EmptyBlockRootRollupInputs) -> pub BlockRootOrBlockMergePublicInputs {
    inputs.execute()
}
