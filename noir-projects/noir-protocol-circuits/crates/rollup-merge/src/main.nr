use dep::rollup_lib::merge::{MergeRollupInputs, BaseOrMergeRollupPublicInputs};

fn main(inputs: MergeRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.merge_rollup_circuit()
}

#[test]
fn test_fg() {
    let inputs = MergeRollupInputs::empty();
    main(inputs);
}
