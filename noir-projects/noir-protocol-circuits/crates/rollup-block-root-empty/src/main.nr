use rollup_lib::block_root::{EmptyBlockRootRollupInputs, BlockRootOrBlockMergePublicInputs};

#[recursive]
fn main(inputs: EmptyBlockRootRollupInputs) -> pub BlockRootOrBlockMergePublicInputs {
    inputs.empty_block_root_rollup_circuit()
}
