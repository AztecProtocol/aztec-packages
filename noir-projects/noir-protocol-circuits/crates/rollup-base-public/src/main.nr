use dep::rollup_lib::base::{BaseOrMergeRollupPublicInputs, PublicBaseRollupInputs};

fn main(inputs: PublicBaseRollupInputs) -> pub BaseOrMergeRollupPublicInputs {
    inputs.execute()
}
