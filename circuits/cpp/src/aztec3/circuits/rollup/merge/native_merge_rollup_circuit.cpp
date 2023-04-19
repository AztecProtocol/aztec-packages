#include "aztec3/circuits/abis/rollup/base/base_or_merge_rollup_public_inputs.hpp"
#include "aztec3/constants.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/merkle_tree/membership.hpp"
#include "barretenberg/stdlib/merkle_tree/memory_tree.hpp"
#include "barretenberg/stdlib/merkle_tree/merkle_tree.hpp"
#include "init.hpp"

#include <aztec3/circuits/rollup/components/components.hpp>

#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
#include <tuple>
#include <vector>

namespace aztec3::circuits::rollup::native_merge_rollup {

BaseOrMergeRollupPublicInputs merge_rollup_circuit(DummyComposer& composer, MergeRollupInputs const& mergeRollupInputs)
{
    // TODO: Verify the previous rollup proofs
    // TODO: Check both previous rollup vks (in previous_rollup_data) against the permitted set of kernel vks.
    // we don't have a set of permitted kernel vks yet.

    auto left = mergeRollupInputs.previous_rollup_data[0].base_or_merge_rollup_public_inputs;
    auto right = mergeRollupInputs.previous_rollup_data[1].base_or_merge_rollup_public_inputs;

    // check that both input proofs are either both "BASE" or "MERGE" and not a mix!
    // this prevents having wonky commitment, nullifier and contract subtrees.
    AggregationObject aggregation_object = components::aggregate_proofs(left, right);
    components::assert_both_input_proofs_of_same_rollup_type(composer, left, right);
    auto current_height = components::assert_both_input_proofs_of_same_height_and_return(composer, left, right);
    components::assert_equal_constants(composer, left, right);
    components::assert_prev_rollups_follow_on_from_each_other(composer, left, right);

    // compute calldata hash:
    auto new_calldata_hash = components::compute_calldata_hash(mergeRollupInputs.previous_rollup_data);

    BaseOrMergeRollupPublicInputs public_inputs = {
        .rollup_type = abis::MERGE_ROLLUP_TYPE,
        .rollup_subtree_height = current_height + 1,
        .end_aggregation_object = aggregation_object,
        .constants = left.constants,
        .start_private_data_tree_snapshot = left.start_private_data_tree_snapshot,
        .end_private_data_tree_snapshot = right.end_private_data_tree_snapshot,
        .start_nullifier_tree_snapshot = left.start_nullifier_tree_snapshot,
        .end_nullifier_tree_snapshot = right.end_nullifier_tree_snapshot,
        .start_contract_tree_snapshot = left.start_contract_tree_snapshot,
        .end_contract_tree_snapshot = right.end_contract_tree_snapshot,
        .calldata_hash = new_calldata_hash,
    };

    return public_inputs;
}

} // namespace aztec3::circuits::rollup::native_merge_rollup