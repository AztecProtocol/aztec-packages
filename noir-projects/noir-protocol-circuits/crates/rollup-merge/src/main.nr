use dep::rollup_lib::merge::{BaseOrMergeRollupPublicInputs, MergeRollupInputs};

fn main(inputs: MergeRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.merge_rollup_circuit()
}
