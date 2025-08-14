use dep::rollup_lib::block_root::{BlockRollupPublicInputs, BlockRootRollupPrivateInputs};

unconstrained fn main(inputs: BlockRootRollupPrivateInputs) -> pub BlockRollupPublicInputs {
    inputs.execute()
}
