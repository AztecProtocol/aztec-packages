use dep::rollup_lib::base::{BaseRollupInputs, BaseOrMergeRollupPublicInputs};

unconstrained fn main(inputs: BaseRollupInputs) -> pub Unconstrained<BaseOrMergeRollupPublicInputs> {
    inputs.base_rollup_circuit()
}
