use dep::rollup_lib::base::{BaseRollupInputs,BaseOrMergeRollupPublicInputs};

// TODO another variant should be added that is constrained
unconstrained fn main(inputs : BaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.base_rollup_circuit()
}