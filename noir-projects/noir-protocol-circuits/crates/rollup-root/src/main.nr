use dep::rollup_lib::root::{RootRollupPrivateInputs, RootRollupPublicInputs};

fn main(inputs: RootRollupPrivateInputs) -> pub RootRollupPublicInputs {
    inputs.execute()
}
