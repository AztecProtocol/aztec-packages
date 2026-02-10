use rollup_lib::block_root::{
    block_root_first_rollup, BlockRollupPublicInputs, BlockRootFirstRollupPrivateInputs,
};

fn main(inputs: BlockRootFirstRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    block_root_first_rollup::execute(inputs)
}
