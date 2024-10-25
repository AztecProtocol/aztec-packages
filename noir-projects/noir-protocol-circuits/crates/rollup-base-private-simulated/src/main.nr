use dep::rollup_lib::base::{PrivateBaseRollupInputs, BaseOrMergeRollupPublicInputs};

unconstrained fn main(inputs: PrivateBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
