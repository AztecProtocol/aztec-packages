use dep::rollup_lib::block_merge::{BlockMergeRollupPrivateInputs, BlockRollupPublicInputs};

fn main(inputs: BlockMergeRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
