#include "barretenberg/vm2/simulation/gadgets/retrieved_bytecodes_tree_check.hpp"

#include "barretenberg/common/assert.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Checks whether a contract class ID exists in the retrieved bytecodes tree.
 *
 * Queries the internal tree for the low leaf, converts it to generic IndexedTreeLeafData,
 * and delegates the membership/non-membership proof to the indexed tree check gadget.
 *
 * @param class_id The contract class ID to look up.
 * @return True if the class ID exists in the tree, false otherwise.
 */
bool RetrievedBytecodesTreeCheck::contains(const FF& class_id)
{
    const auto snapshot = tree.get_snapshot();
    auto [exists, low_leaf_index] = tree.get_low_indexed_leaf(class_id);
    auto sibling_path = tree.get_sibling_path(low_leaf_index);
    auto low_leaf_preimage = tree.get_leaf_preimage(low_leaf_index);

    indexed_tree_check.assert_read(class_id,
                                   std::nullopt, // No siloing
                                   exists,
                                   IndexedTreeLeafData{
                                       .value = low_leaf_preimage.leaf.class_id,
                                       .next_value = low_leaf_preimage.nextKey,
                                       .next_index = low_leaf_preimage.nextIndex,
                                   },
                                   low_leaf_index,
                                   sibling_path,
                                   snapshot);
    return exists;
}

/**
 * @brief Inserts a contract class ID into the retrieved bytecodes tree.
 *
 * Performs the insertion on the in memory tree, then delegates the constrained write (or
 * duplicate detection) to the indexed tree check gadget. No siloing is applied.
 *
 * @param class_id The contract class ID to insert.
 * @throws std::runtime_error If the indexed tree check write returns a snapshot that does not match the internal tree.
 */
void RetrievedBytecodesTreeCheck::insert(const FF& class_id)
{
    AppendOnlyTreeSnapshot prev_snapshot = tree.get_snapshot();
    auto insertion_result = tree.insert_indexed_leaves({ { ClassIdLeafValue(class_id) } });
    auto& [low_leaf_preimage, low_leaf_index, low_leaf_sibling_path] = insertion_result.low_leaf_witness_data.at(0);
    std::span<FF> insertion_sibling_path = insertion_result.insertion_witness_data.at(0).path;

    // If we pass a insertion sibling path, indexed tree check will assert that the leaf doesn't exist,
    // otherwise, it will assert that the leaf exists.
    bool exists = class_id == low_leaf_preimage.leaf.class_id;

    AppendOnlyTreeSnapshot next_snapshot =
        indexed_tree_check.write(class_id,
                                 std::nullopt, // No siloing
                                 std::nullopt, // No public inputs write
                                 IndexedTreeLeafData{
                                     .value = low_leaf_preimage.leaf.class_id,
                                     .next_value = low_leaf_preimage.nextKey,
                                     .next_index = low_leaf_preimage.nextIndex,
                                 },
                                 low_leaf_index,
                                 low_leaf_sibling_path,
                                 prev_snapshot,
                                 exists ? std::nullopt : std::optional(insertion_sibling_path));

    // This will throw an unexpected exception if it fails.
    BB_ASSERT_EQ(next_snapshot, tree.get_snapshot(), "Next snapshot mismatch");
}

/**
 * @brief Returns the current tree snapshot.
 * @return The current tree snapshot.
 */
AppendOnlyTreeSnapshot RetrievedBytecodesTreeCheck::get_snapshot() const
{
    return tree.get_snapshot();
}

/**
 * @brief Returns the number of retrieved bytecode class IDs in the tree.
 * @return The number of class IDs, excluding the prefill leaf at index 0.
 * @note Subtracts 1 to account for the prefill leaf at index 0.
 */
uint32_t RetrievedBytecodesTreeCheck::size() const
{
    // -1 Since the tree has a prefill leaf at index 0.
    return static_cast<uint32_t>(tree.get_snapshot().next_available_leaf_index) - 1;
}

} // namespace bb::avm2::simulation
