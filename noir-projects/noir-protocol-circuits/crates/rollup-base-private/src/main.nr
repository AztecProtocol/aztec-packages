use dep::rollup_lib::base::{PrivateBaseRollupInputs, BaseOrMergeRollupPublicInputs};

#[recursive]
fn main(inputs: PrivateBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
