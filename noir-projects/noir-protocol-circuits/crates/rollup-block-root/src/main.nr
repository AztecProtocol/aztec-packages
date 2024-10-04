use dep::rollup_lib::block_root::{BlockRootRollupInputs, BlockRootOrBlockMergePublicInputs};

#[recursive]
fn main(inputs: BlockRootRollupInputs) -> pub BlockRootOrBlockMergePublicInputs {
    inputs.block_root_rollup_circuit()
}
