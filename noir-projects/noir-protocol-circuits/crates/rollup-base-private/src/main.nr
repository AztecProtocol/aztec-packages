use dep::rollup_lib::base::{BaseOrMergeRollupPublicInputs, PrivateBaseRollupInputs};

fn main(inputs: PrivateBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
