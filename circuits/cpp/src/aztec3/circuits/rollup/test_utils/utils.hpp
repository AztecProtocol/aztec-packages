#pragma once
#include "nullifier_tree_testing_harness.hpp"
#include "init.hpp"

namespace aztec3::circuits::rollup::test_utils::utils {

namespace {

using NT = aztec3::utils::types::NativeTypes;

// Types
using ConstantRollupData = aztec3::circuits::abis::ConstantRollupData<NT>;
using BaseRollupInputs = aztec3::circuits::abis::BaseRollupInputs<NT>;
using BaseOrMergeRollupPublicInputs = aztec3::circuits::abis::BaseOrMergeRollupPublicInputs<NT>;
using DummyComposer = aztec3::utils::DummyComposer;

using Aggregator = aztec3::circuits::recursion::Aggregator;
using AppendOnlyTreeSnapshot = aztec3::circuits::abis::AppendOnlyTreeSnapshot<NT>;

using NullifierLeafPreimage = aztec3::circuits::abis::NullifierLeafPreimage<NT>;

// Nullifier Tree Alias
using MerkleTree = stdlib::merkle_tree::MemoryTree;
using NullifierTree = stdlib::merkle_tree::NullifierMemoryTree;
using NullifierLeaf = stdlib::merkle_tree::nullifier_leaf;

using aztec3::circuits::abis::MembershipWitness;

using nullifier_tree_testing_values = std::tuple<BaseRollupInputs, AppendOnlyTreeSnapshot, AppendOnlyTreeSnapshot>;
} // namespace

BaseRollupInputs dummy_base_rollup_inputs();

template <size_t N>
std::array<fr, N> get_sibling_path(MerkleTree tree, size_t leafIndex, size_t const& subtree_depth_to_skip)
{
    std::array<fr, N> siblingPath;
    auto path = tree.get_hash_path(leafIndex);
    // slice out the skip
    leafIndex = leafIndex >> (subtree_depth_to_skip);
    for (size_t i = 0; i < N; i++) {
        if (leafIndex & (1 << i)) {
            siblingPath[i] = path[subtree_depth_to_skip + i].first;
        } else {
            siblingPath[i] = path[subtree_depth_to_skip + i].second;
        }
    }
    return siblingPath;
}

NullifierMemoryTreeTestingHarness get_initial_nullifier_tree(size_t spacing);
abis::AppendOnlyTreeSnapshot<NT> get_snapshot_of_tree_state(NullifierMemoryTreeTestingHarness nullifier_tree);

nullifier_tree_testing_values generate_nullifier_tree_testing_values_explicit(
    BaseRollupInputs inputs,
    std::array<fr, KERNEL_NEW_NULLIFIERS_LENGTH * 2> new_nullifiers,
    std::vector<fr> initial_values);

nullifier_tree_testing_values generate_nullifier_tree_testing_values(BaseRollupInputs inputs,
                                                                     size_t starting_insertion_value,
                                                                     size_t spacing);

nullifier_tree_testing_values generate_nullifier_tree_testing_values(
    BaseRollupInputs inputs, std::array<fr, KERNEL_NEW_NULLIFIERS_LENGTH * 2> new_nullifiers, size_t spacing);

} // namespace aztec3::circuits::rollup::test_utils::utils