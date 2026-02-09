use ::rollup_lib::block_merge::{
    block_merge_rollup, BlockMergeRollupPrivateInputs, BlockRollupPublicInputs,
};

fn main(inputs: BlockMergeRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    block_merge_rollup::execute(inputs)
}
