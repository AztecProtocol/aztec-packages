#pragma once
#include "../hash.hpp"
#include "../hash_path.hpp"
#include "nullifier_leaf.hpp"

namespace bb::stdlib::merkle_tree {

using namespace bb;

template <typename Store> class IndexedTree {
  public:
    typedef uint256_t index_t;

    IndexedTree(Store& store, size_t depth, uint8_t tree_id = 0);
    IndexedTree(IndexedTree const& other) = delete;
    IndexedTree(IndexedTree&& other) = delete;
    ~IndexedTree();

    // using MerkleTree<Store>::get_hash_path;

    fr_hash_path update_element(fr const& value);
    std::vector<fr_hash_path> update_elements(const std::vector<fr>& values);

    index_t get_size();
    fr get_root();

    fr_hash_path get_hash_path(index_t index);

  private:
    // using MerkleTree<Store>::update_element;
    // using MerkleTree<Store>::get_element;
    // using MerkleTree<Store>::compute_zero_path_hash;

    void update_leaf_and_hash_to_root(index_t index, const WrappedNullifierLeaf& leaf);
    fr get_element_or_zero(size_t level, index_t index);
    void create_key(size_t level, index_t index, std::vector<uint8_t>& key);

    void write_node(size_t level, index_t index, const fr& value);
    std::pair<bool, fr> read_node(size_t level, index_t index);

  private:
    Store& store_;
    size_t depth_;
    uint8_t tree_id_;
    std::vector<WrappedNullifierLeaf> leaves_;
    std::vector<fr> zero_hashes_;
    fr root_;
};

} // namespace bb::stdlib::merkle_tree
