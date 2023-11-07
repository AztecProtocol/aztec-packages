use crate::merge::merge_rollup_inputs::MergeRollupInputs;
use crate::abis::base_or_merge_rollup_public_inputs::BASE_ROLLUP_TYPE;

pub fn default_merge_rollup_inputs() -> MergeRollupInputs {
    let mut inputs: MergeRollupInputs = dep::std::unsafe::zeroed();

    inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.rollup_type = BASE_ROLLUP_TYPE;
    inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.rollup_type = BASE_ROLLUP_TYPE;

    inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.rollup_subtree_height = 1;
    inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.rollup_subtree_height = 1;

    inputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs.calldata_hash = [0, 1];
    inputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs.calldata_hash = [2, 3];

    inputs
}