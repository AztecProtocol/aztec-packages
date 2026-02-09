use ::rollup_lib::block_root::{
    block_root_rollup, BlockRollupPublicInputs, BlockRootRollupPrivateInputs,
};

fn main(inputs: BlockRootRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    block_root_rollup::execute(inputs)
}
