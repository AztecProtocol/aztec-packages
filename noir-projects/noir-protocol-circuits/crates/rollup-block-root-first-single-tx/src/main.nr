use dep::rollup_lib::block_root::{
    BlockRollupPublicInputs, BlockRootSingleTxFirstRollupPrivateInputs,
};

fn main(inputs: BlockRootSingleTxFirstRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
