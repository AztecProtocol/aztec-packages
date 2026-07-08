use rollup_lib::block_root::{
    block_root_msgs_only_rollup, BlockRollupPublicInputs, BlockRootMsgsOnlyRollupPrivateInputs,
};

fn main(inputs: BlockRootMsgsOnlyRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    block_root_msgs_only_rollup::execute(inputs)
}
