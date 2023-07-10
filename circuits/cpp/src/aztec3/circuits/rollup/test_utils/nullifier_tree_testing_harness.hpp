#pragma once
#include "aztec3/circuits/abis/append_only_tree_snapshot.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

#include <tuple>

namespace {
using aztec3::utils::types::NativeTypes;
using MemoryStore = proof_system::plonk::stdlib::merkle_tree::MemoryStore;
using NullifierTree = proof_system::plonk::stdlib::merkle_tree::NullifierTree<MemoryStore>;
}  // namespace
/**
 * A version of the nullifier tree with extra methods specific to testing our rollup circuits.
 */
class NullifierTreeTestingHarness : public NullifierTree {
    using nullifier_leaf = proof_system::plonk::stdlib::merkle_tree::nullifier_leaf;

  public:
    explicit NullifierTreeTestingHarness(MemoryStore& store, size_t depth, uint8_t tree_id = 0);

    using MerkleTree::get_hash_path;
    using MerkleTree::root;
    using MerkleTree::size;
    using MerkleTree::update_element;

    using NullifierTree::update_element;

    // using NullifierTree::get_hashes;
    using NullifierTree::get_leaf;
    using NullifierTree::get_leaves;

    // Get the value immediately lower than the given value
    std::pair<nullifier_leaf, size_t> find_lower(fr const& value);

    // Utilities to inspect tree
    fr total_size() const { return 1UL << depth_; }
    fr depth() const { return depth_; }

    // // Current size of the tree
    // fr size() { return leaves_.size(); }

    aztec3::circuits::abis::AppendOnlyTreeSnapshot<aztec3::utils::types::NativeTypes> get_snapshot()
    {
        return { .root = root(), .next_available_leaf_index = static_cast<unsigned int>(size()) };
    }

    void update_element_in_place(size_t index, const nullifier_leaf& leaf);

    // Get all of the sibling paths and low nullifier values required to craft an non membership / inclusion proofs
    std::tuple<std::vector<nullifier_leaf>, std::vector<std::vector<fr>>, std::vector<uint32_t>>
    circuit_prep_batch_insert(std::vector<fr> const& values);

  protected:
    using MerkleTree::depth_;
    // using MerkleTree::hashes_;
    // using MerkleTree::root_;
    // using MerkleTree::total_size_;
    // using NullifierTree::leaves_;
};
