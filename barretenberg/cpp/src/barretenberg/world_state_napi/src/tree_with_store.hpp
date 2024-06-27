#pragma once

#include "barretenberg/crypto/merkle_tree/append_only_tree/append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_tree_store.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb::world_state {

using namespace bb::crypto::merkle_tree;
using HashingPolicy = PedersenHashPolicy;
using TreeStore = CachedTreeStore<LMDBStore, fr>;
using Tree = AppendOnlyTree<TreeStore, HashingPolicy>;

struct TreeWithStore {
    std::unique_ptr<Tree> tree;
    std::unique_ptr<TreeStore> store;

    TreeWithStore(std::unique_ptr<Tree> t, std::unique_ptr<TreeStore> s)
        : tree(std::move(t))
        , store(std::move(s))
    {}

    TreeWithStore(TreeWithStore&& other) noexcept
        : tree(std::move(other.tree))
        , store(std::move(other.store))
    {}

    TreeWithStore& operator=(TreeWithStore&& other) = delete;
    ~TreeWithStore() = default;
    TreeWithStore(const TreeWithStore& other) = delete;
    TreeWithStore& operator=(const TreeWithStore& other) = delete;
};

} // namespace bb::world_state
