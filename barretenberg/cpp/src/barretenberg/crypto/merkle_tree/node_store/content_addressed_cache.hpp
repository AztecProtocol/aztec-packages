#pragma once
#include "./tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "msgpack/assert.hpp"
#include <cstdint>
#include <exception>
#include <iostream>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <unordered_map>
#include <utility>
#include <vector>

template <> struct std::hash<uint256_t> {
    std::size_t operator()(const uint256_t& k) const { return k.data[0]; }
};
template <> struct std::hash<bb::fr> {
    std::size_t operator()(const bb::fr& k) const
    {
        bb::numeric::uint256_t val(k);
        return val.data[0];
    }
};

namespace bb::crypto::merkle_tree {

template <typename LeafValueType> class ContentAddressedCache {
  public:
    using LeafType = LeafValueType;
    using IndexedLeafValueType = IndexedLeaf<LeafValueType>;
    using SharedPtr = std::shared_ptr<ContentAddressedCache>;
    using UniquePtr = std::unique_ptr<ContentAddressedCache>;

    ContentAddressedCache() = delete;
    ContentAddressedCache(uint32_t depth) { reset(depth); }
    ~ContentAddressedCache() = default;
    ContentAddressedCache(const ContentAddressedCache& other) = default;
    ContentAddressedCache& operator=(const ContentAddressedCache& other) = default;
    ContentAddressedCache(ContentAddressedCache&& other) noexcept = default;
    ContentAddressedCache& operator=(ContentAddressedCache&& other) noexcept = default;

    // This is a mapping between the node hash and it's payload (children and ref count) for every node in the tree,
    // including leaves. As indexed trees are updated, this will end up containing many nodes that are not part of the
    // final tree so they need to be omitted from what is committed.
    std::unordered_map<fr, NodePayload> nodes_;

    // This is a store mapping the leaf key (e.g. slot for public data or nullifier value for nullifier tree) to the
    // index in the tree
    std::map<uint256_t, index_t> indices_;

    // This is a mapping from leaf hash to leaf pre-image. This will contain entries that need to be omitted when
    // commiting updates
    std::unordered_map<fr, IndexedLeafValueType> leaves_;
    TreeMeta meta_;

    // The following stores are not persisted, just cached until commit
    std::vector<std::unordered_map<index_t, fr>> nodes_by_index_;
    std::unordered_map<index_t, IndexedLeafValueType> leaf_pre_image_by_index_;

    void reset(uint32_t depth)
    {
        nodes_ = std::unordered_map<fr, NodePayload>();
        indices_ = std::map<uint256_t, index_t>();
        leaves_ = std::unordered_map<fr, IndexedLeafValueType>();
        nodes_by_index_ = std::vector<std::unordered_map<index_t, fr>>(depth + 1, std::unordered_map<index_t, fr>());
        leaf_pre_image_by_index_ = std::unordered_map<index_t, IndexedLeafValueType>();
    }
};
} // namespace bb::crypto::merkle_tree