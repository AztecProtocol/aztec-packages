use dep::rollup_lib::base::{BaseOrMergeRollupPublicInputs, PrivateBaseRollupInputs};

unconstrained fn main(inputs: PrivateBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
