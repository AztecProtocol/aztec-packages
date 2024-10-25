use dep::rollup_lib::base::{PublicBaseRollupInputs, BaseOrMergeRollupPublicInputs};

unconstrained fn main(inputs: PublicBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
