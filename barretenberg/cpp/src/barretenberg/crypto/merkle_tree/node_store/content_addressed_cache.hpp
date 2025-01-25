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
    ContentAddressedCache(uint32_t depth);
    ~ContentAddressedCache() = default;
    ContentAddressedCache(const ContentAddressedCache& other) = default;
    ContentAddressedCache& operator=(const ContentAddressedCache& other) = default;
    ContentAddressedCache(ContentAddressedCache&& other) noexcept = default;
    ContentAddressedCache& operator=(ContentAddressedCache&& other) noexcept = default;

    void checkpoint();
    void revert();
    void commit();

    void reset(uint32_t depth);
    std::pair<bool, index_t> find_low_value(const fr& new_leaf_key,
                                            const uint256_t& retrieved_value,
                                            const index_t& db_index) const;

    bool get_leaf_preimage_by_hash(const fr& leaf_hash, IndexedLeafValueType& leafPreImage) const;
    void put_leaf_preimage_by_hash(const fr& leaf_hash, const IndexedLeafValueType& leafPreImage);

    bool get_leaf_by_index(const index_t& index, IndexedLeafValueType& leaf) const;
    void put_leaf_by_index(const index_t& index, const IndexedLeafValueType& leaf);

    void update_leaf_key_index(const index_t& index, const fr& leaf_key);
    std::optional<index_t> get_leaf_key_index(const fr& leaf_key) const;

    void put_node(const fr& node_hash, const NodePayload& node);
    bool get_node(const fr& node_hash, NodePayload& node) const;

    void put_meta(const TreeMeta& meta) { meta_ = meta; }
    const TreeMeta& get_meta() const { return meta_; }

    std::optional<fr> get_node_by_index(uint32_t level, const index_t& index) const;
    void put_node_by_index(uint32_t level, const index_t& index, const fr& node);

    const std::map<uint256_t, index_t>& get_indices() const { return indices_; }

  private:
    struct Journal {
        TreeMeta meta_;
        std::vector<std::unordered_map<index_t, fr>> nodes_by_index_;
        std::unordered_map<index_t, IndexedLeafValueType> leaf_pre_image_by_index_;

        Journal(TreeMeta meta)
            : meta_(std::move(meta))
        {}
    };
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

    // The currently active journals
    std::vector<Journal> journals_;
};

template <typename LeafValueType> ContentAddressedCache<LeafValueType>::ContentAddressedCache(uint32_t depth)
{
    reset(depth);
}

template <typename LeafValueType> void ContentAddressedCache<LeafValueType>::checkpoint()
{
    journals_.emplace_back(Journal(meta_.size));
}

template <typename LeafValueType> void ContentAddressedCache<LeafValueType>::revert()
{
    // We need to do a number of things here
    // 1. Remove all leaves that were added since the last checkpoint, so those >= start index of the last journal
    // 2. Revert all of the leaves that were updated since the last checkpoint, so < start index of the last journal
    // 3. Revert all of the nodes that were updated since the last checkpoint

    if (journals_.empty()) {
        throw std::runtime_error("Cannot revert without a checkpoint");
    }
    Journal& journal = journals_.back();
    index_t currentMaxIndex = meta_.size;
    for (index_t index = journal.start_index_; index < currentMaxIndex; ++index) {
        leaf_pre_image_by_index_.erase(index);
    }
    for (auto& [index, leaf] : journal.leaf_pre_image_by_index_) {
        leaf_pre_image_by_index_[index] = leaf;
    }
    for (auto& [index, node] : journal.nodes_by_index_) {
        nodes_by_index_[index] = node;
    }
    journals_.pop_back();
}

template <typename LeafValueType> void ContentAddressedCache<LeafValueType>::commit() {}

template <typename LeafValueType> void ContentAddressedCache<LeafValueType>::reset(uint32_t depth)
{
    nodes_ = std::unordered_map<fr, NodePayload>();
    indices_ = std::map<uint256_t, index_t>();
    leaves_ = std::unordered_map<fr, IndexedLeafValueType>();
    nodes_by_index_ = std::vector<std::unordered_map<index_t, fr>>(depth + 1, std::unordered_map<index_t, fr>());
    leaf_pre_image_by_index_ = std::unordered_map<index_t, IndexedLeafValueType>();
    journals_ = std::vector<Journal>();
}

template <typename LeafValueType>
std::pair<bool, index_t> ContentAddressedCache<LeafValueType>::find_low_value(const fr& new_leaf_key,
                                                                              const uint256_t& retrieved_value,
                                                                              const index_t& db_index) const
{
    auto new_value_as_number = uint256_t(new_leaf_key);
    // At this stage, we have been asked to include uncommitted and the value was not exactly found in the db
    auto it = indices_.lower_bound(new_value_as_number);
    if (it == indices_.end()) {
        // there is no element >= the requested value.
        // decrement the iterator to get the value preceeding the requested value
        --it;
        // we need to return the larger of the db value or the cached value

        return std::make_pair(false, it->first > retrieved_value ? it->second : db_index);
    }

    if (it->first == uint256_t(new_value_as_number)) {
        // the value is already present and the iterator points to it
        return std::make_pair(true, it->second);
    }
    // the iterator points to the element immediately larger than the requested value
    // We need to return the highest value from
    // 1. The next lowest cached value, if there is one
    // 2. The value retrieved from the db
    if (it == indices_.begin()) {
        // No cached lower value, return the db index
        return std::make_pair(false, db_index);
    }
    --it;
    //  it now points to the value less than that requested
    return std::make_pair(false, it->first > retrieved_value ? it->second : db_index);
}

template <typename LeafValueType>
bool ContentAddressedCache<LeafValueType>::get_leaf_preimage_by_hash(const fr& leaf_hash,
                                                                     IndexedLeafValueType& leafPreImage) const
{
    typename std::unordered_map<fr, IndexedLeafValueType>::const_iterator it = leaves_.find(leaf_hash);
    if (it != leaves_.end()) {
        leafPreImage = it->second;
        return true;
    }
    return false;
}

template <typename LeafValueType>
void ContentAddressedCache<LeafValueType>::put_leaf_preimage_by_hash(const fr& leaf_hash,
                                                                     const IndexedLeafValueType& leafPreImage)
{
    leaves_[leaf_hash] = leafPreImage;
}

template <typename LeafValueType>
bool ContentAddressedCache<LeafValueType>::get_leaf_by_index(const index_t& index, IndexedLeafValueType& leaf) const
{
    typename std::unordered_map<index_t, IndexedLeafValueType>::const_iterator it =
        leaf_pre_image_by_index_.find(index);
    if (it != leaf_pre_image_by_index_.end()) {
        leaf = it->second;
        return true;
    }
    return false;
}

template <typename LeafValueType>
void ContentAddressedCache<LeafValueType>::put_leaf_by_index(const index_t& index,
                                                             const IndexedLeafValueType& leafPreImage)
{
    // If there are no journals, we can just update the leaf pre-image and leave
    if (journals_.empty()) {
        leaf_pre_image_by_index_[index] = leafPreImage;
        return;
    }
    // Look at the given index
    // If it is beyond the current journal's start index then there is no need to store it in the journal
    // Also, if it already exists in the journal, we don't want to overwrite it
    // Otherwise we grab the value from the primary cache, if it exists and store it in the journal
    Journal& journal = journals_.back();
    if (index < journal.start_index_ &&
        journal.leaf_pre_image_by_index_.find(index) == journal.leaf_pre_image_by_index_.end()) {
        auto cacheIter = leaf_pre_image_by_index_.find(index);
        if (cacheIter != leaf_pre_image_by_index_.end()) {
            journal.leaf_pre_image_by_index_[index] = cacheIter->second;
        }
    }
    leaf_pre_image_by_index_[index] = leafPreImage;
}

template <typename LeafValueType>
void ContentAddressedCache<LeafValueType>::update_leaf_key_index(const index_t& index, const fr& leaf_key)
{
    indices_.insert({ uint256_t(leaf_key), index });
}

template <typename LeafValueType>
std::optional<index_t> ContentAddressedCache<LeafValueType>::get_leaf_key_index(const fr& leaf_key) const
{
    auto it = indices_.find(uint256_t(leaf_key));
    if (it == indices_.end()) {
        return std::nullopt;
    }
    return it->second;
}

template <typename LeafValueType>
void ContentAddressedCache<LeafValueType>::put_node(const fr& node_hash, const NodePayload& node)
{
    nodes_[node_hash] = node;
}

template <typename LeafValueType>
bool ContentAddressedCache<LeafValueType>::get_node(const fr& node_hash, NodePayload& node) const
{
    auto it = nodes_.find(node_hash);
    if (it == nodes_.end()) {
        return false;
    }
    node = it->second;
    return true;
}

template <typename LeafValueType>
std::optional<fr> ContentAddressedCache<LeafValueType>::get_node_by_index(uint32_t level, const index_t& index) const
{
    auto it = nodes_by_index_[level].find(index);
    if (it == nodes_by_index_[level].end()) {
        return std::nullopt;
    }
    return it->second;
}

template <typename LeafValueType>
void ContentAddressedCache<LeafValueType>::put_node_by_index(uint32_t level, const index_t& index, const fr& node)
{
    // If there are no journals, we can just update the node and leave
    if (journals_.empty()) {
        nodes_by_index_[level][index] = node;
        return;
    }
    // If there is a journal then we need to check if the node is already in it
    // If not then we store the current value from the primary cache
    Journal& journal = journals_.back();
    if (journal.nodes_by_index_[level].find(index) == journal.nodes_by_index_[level].end()) {
        auto cacheIter = nodes_by_index_[level].find(index);
        if (cacheIter != nodes_by_index_[level].end()) {
            journal.nodes_by_index_[level][index] = cacheIter->second;
        }
    }
    nodes_by_index_[level][index] = node;
}
} // namespace bb::crypto::merkle_tree