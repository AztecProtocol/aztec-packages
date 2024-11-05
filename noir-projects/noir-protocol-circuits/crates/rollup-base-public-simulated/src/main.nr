use dep::rollup_lib::base::{BaseOrMergeRollupPublicInputs, PublicBaseRollupInputs};

unconstrained fn main(inputs: PublicBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
