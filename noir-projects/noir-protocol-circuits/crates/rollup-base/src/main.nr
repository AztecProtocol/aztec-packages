use dep::rollup_lib::base::{BaseOrMergeRollupPublicInputs, BaseRollupInputs};

#[recursive]
fn main(inputs: BaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.base_rollup_circuit()
}
