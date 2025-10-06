use dep::rollup_lib::block_root::{BlockRollupPublicInputs, BlockRootFirstRollupPrivateInputs};

unconstrained fn main(inputs: BlockRootFirstRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
