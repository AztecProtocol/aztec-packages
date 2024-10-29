use dep::rollup_lib::base::{BaseOrMergeRollupPublicInputs, PrivateBaseRollupInputs};

#[recursive]
unconstrained fn main(inputs: PrivateBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
