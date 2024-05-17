use dep::rollup_lib::root::{RootRollupInputs, RootRollupPublicInputs};

#[recursive]
fn main(inputs: RootRollupInputs) -> pub RootRollupPublicInputs {
    inputs.root_rollup_circuit()
}
