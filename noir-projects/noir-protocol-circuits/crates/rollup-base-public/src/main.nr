use dep::rollup_lib::base::{PublicBaseRollupInputs, BaseOrMergeRollupPublicInputs};

#[recursive]
fn main(inputs: PublicBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
