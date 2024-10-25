use rollup_lib::block_root::{BlockRootOrBlockMergePublicInputs, EmptyBlockRootRollupInputs};

#[recursive]
fn main(inputs: EmptyBlockRootRollupInputs) -> pub BlockRootOrBlockMergePublicInputs {
    inputs.empty_block_root_rollup_circuit()
}
