#pragma once

#include <cstddef>

#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

namespace bb::avm2::simulation {

template <typename LeafType, typename HashingPolicy> class IndexedMemoryTree {
  public:
    IndexedMemoryTree(size_t depth, size_t num_default_values);

    GetLowIndexedLeafResponse get_low_indexed_leaf(const FF& key) const;

    IndexedLeaf<LeafType> get_leaf_preimage(size_t leaf_index) const;

    SiblingPath get_sibling_path(size_t leaf_index) const;

    AppendOnlyTreeSnapshot get_snapshot() const;

    SequentialInsertionResult<LeafType> insert_indexed_leaves(std::span<const LeafType> leaves);

  private:
    MemoryTree<HashingPolicy> tree;
    size_t depth;
    size_t max_leaves;
    std::vector<IndexedLeaf<LeafType>> leaves;
};

template <typename LeafType, typename HashingPolicy>
IndexedMemoryTree<LeafType, HashingPolicy>::IndexedMemoryTree(size_t depth, size_t num_default_values)
    : tree(depth)
    , depth(depth)
    , max_leaves(1 << depth)
{
    assert(num_default_values > 0);

    std::vector<LeafType> default_leaves;
    default_leaves.reserve(num_default_values);

    for (size_t i = 0; i < num_default_values; ++i) {
        // Avoid an empty leaf in the default values, so this can be used with just one default value.
        default_leaves.push_back(LeafType::padding(i + 1));
    }

    leaves.reserve(max_leaves);

    for (size_t i = 0; i < default_leaves.size(); ++i) {
        // If it's the last leaf, point to infinity (next_index = 0 and next_key = 0)
        index_t next_index = i == (default_leaves.size() - 1) ? 0 : i + 1;
        FF next_key = i == (default_leaves.size() - 1) ? 0 : default_leaves[i + 1].get_key();

        IndexedLeaf<LeafType> initial_leaf(default_leaves[i], next_index, next_key);

        leaves.push_back(initial_leaf);

        FF leaf_hash = HashingPolicy::hash(initial_leaf.get_hash_inputs());
        tree.update_element(i, leaf_hash);
    }
}

template <typename LeafType, typename HashingPolicy>
GetLowIndexedLeafResponse IndexedMemoryTree<LeafType, HashingPolicy>::get_low_indexed_leaf(const FF& key) const
{
    uint256_t key_integer = static_cast<uint256_t>(key);
    uint256_t low_key_integer = 0;
    size_t low_index = 0;
    // Linear search for the low indexed leaf.
    for (size_t i = 0; i < leaves.size(); ++i) {
        uint256_t leaf_key_integer = static_cast<uint256_t>(leaves[i].leaf.get_key());
        if (leaf_key_integer == key_integer) {
            return GetLowIndexedLeafResponse(true, i);
        }
        if (leaf_key_integer < key_integer && leaf_key_integer > low_key_integer) {
            low_key_integer = leaf_key_integer;
            low_index = i;
        }
    }

    return GetLowIndexedLeafResponse(false, low_index);
}

template <typename LeafType, typename HashingPolicy>
IndexedLeaf<LeafType> IndexedMemoryTree<LeafType, HashingPolicy>::get_leaf_preimage(size_t leaf_index) const
{
    return leaves.at(leaf_index);
}

template <typename LeafType, typename HashingPolicy>
SiblingPath IndexedMemoryTree<LeafType, HashingPolicy>::get_sibling_path(size_t leaf_index) const
{
    return tree.get_sibling_path(leaf_index);
}

template <typename LeafType, typename HashingPolicy>
AppendOnlyTreeSnapshot IndexedMemoryTree<LeafType, HashingPolicy>::get_snapshot() const
{
    return AppendOnlyTreeSnapshot{
        .root = tree.root(),
        .nextAvailableLeafIndex = leaves.size(),
    };
}

template <typename LeafType, typename HashingPolicy>
SequentialInsertionResult<LeafType> IndexedMemoryTree<LeafType, HashingPolicy>::insert_indexed_leaves(
    std::span<const LeafType> leaves_to_insert)
{
    SequentialInsertionResult<LeafType> result = {};
    result.insertion_witness_data.reserve(leaves_to_insert.size());
    result.low_leaf_witness_data.reserve(leaves_to_insert.size());

    for (const auto& leaf_to_insert : leaves_to_insert) {
        FF key = leaf_to_insert.get_key();
        GetLowIndexedLeafResponse find_low_leaf_result = get_low_indexed_leaf(key);
        IndexedLeaf<LeafType>& low_leaf = leaves.at(find_low_leaf_result.index);

        result.low_leaf_witness_data.push_back(LeafUpdateWitnessData<LeafType>(
            low_leaf, find_low_leaf_result.index, tree.get_sibling_path(find_low_leaf_result.index)));

        if (!find_low_leaf_result.is_already_present) {
            // If the leaf is not already present, we point the low leaf to the new leaf and then insert the new leaf.
            IndexedLeaf<LeafType> new_indexed_leaf(leaf_to_insert, low_leaf.nextIndex, low_leaf.nextKey);
            index_t insertion_index = leaves.size();

            low_leaf.nextIndex = insertion_index;
            low_leaf.nextKey = key;
            FF low_leaf_hash = HashingPolicy::hash(low_leaf.get_hash_inputs());
            tree.update_element(find_low_leaf_result.index, low_leaf_hash);

            FF new_leaf_hash = HashingPolicy::hash(new_indexed_leaf.get_hash_inputs());
            tree.update_element(insertion_index, new_leaf_hash);

            leaves.push_back(new_indexed_leaf);

            result.insertion_witness_data.push_back(LeafUpdateWitnessData<LeafType>(
                new_indexed_leaf, insertion_index, tree.get_sibling_path(insertion_index)));

        } else if (LeafType::is_updateable()) {
            // Update the current leaf's value, don't change it's link
            low_leaf = IndexedLeaf<LeafType>(leaf_to_insert, low_leaf.nextIndex, low_leaf.nextKey);
            FF low_leaf_hash = HashingPolicy::hash(low_leaf.get_hash_inputs());
            tree.update_element(find_low_leaf_result.index, low_leaf_hash);

            // Push an empty insertion witness
            result.insertion_witness_data.push_back(
                LeafUpdateWitnessData<LeafType>(IndexedLeaf<LeafType>::empty(), 0, {}));
        } else {
            throw std::runtime_error("Leaf is not updateable");
        }
    }

    return result;
}

} // namespace bb::avm2::simulation
