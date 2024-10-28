use dep::rollup_lib::base::{BaseOrMergeRollupPublicInputs, PublicBaseRollupInputs};

#[recursive]
unconstrained fn main(inputs: PublicBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
