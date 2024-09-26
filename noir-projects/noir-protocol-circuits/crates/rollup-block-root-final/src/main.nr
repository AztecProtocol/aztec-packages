use dep::rollup_lib::block_root::{BlockRootRollupInputs, BlockRootOrBlockMergePublicInputs};

// This is a non-recursive variant of the rollup-block-root. We use it so we can generate proofs that can be verified on L1, until we
// drop support for proving single blocks and move to epoch proving completely.
fn main(inputs: BlockRootRollupInputs) -> pub BlockRootOrBlockMergePublicInputs {
    inputs.block_root_rollup_circuit()
}
