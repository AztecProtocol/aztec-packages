use dep::rollup_lib::block_root::{BlockRollupPublicInputs, BlockRootFirstRollupPrivateInputs};

fn main(inputs: BlockRootFirstRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
