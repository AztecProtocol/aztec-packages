#pragma once

#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

namespace bb::avm2::testing {

// This is a memory tree that can generate sibling paths of any size.
// The standard memory tree only supports up to 20 layers
// However in VM2 testing we sometimes need to generate sibling paths with real lengths.
template <typename HashingPolicy> class TestMemoryTree {
  public:
    TestMemoryTree(size_t depth, size_t total_depth)
        : real_tree(depth)
        , total_depth(total_depth)
        , depth(depth)
    {}

    fr_sibling_path get_sibling_path(size_t index);

    FF update_element(size_t index, FF const& value);

    FF root() const;

  private:
    MemoryTree<HashingPolicy> real_tree;
    size_t total_depth;
    size_t depth;
};

template <typename HashingPolicy> FF TestMemoryTree<HashingPolicy>::update_element(size_t index, FF const& value)
{
    if (index > (1ULL << depth)) {
        throw std::invalid_argument("Index outside real tree");
    }
    return real_tree.update_element(index, value);
}

template <typename HashingPolicy> fr_sibling_path TestMemoryTree<HashingPolicy>::get_sibling_path(size_t index)
{
    std::vector<FF> real_path = real_tree.get_sibling_path(index);
    for (size_t i = 0; i < total_depth - depth; i++) {
        real_path.emplace_back(0);
    }
    return real_path;
}

template <typename HashingPolicy> FF TestMemoryTree<HashingPolicy>::root() const
{
    FF root = real_tree.root();
    for (size_t i = 0; i < total_depth - depth; i++) {
        root = HashingPolicy::hash_pair(root, 0);
    }
    return root;
}

} // namespace bb::avm2::testing
