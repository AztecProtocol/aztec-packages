use dep::rollup_lib::base::{BaseOrMergeRollupPublicInputs, PublicBaseRollupInputs};

#[recursive]
fn main(inputs: PublicBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
