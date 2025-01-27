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
    bool operator==(const ContentAddressedCache& other) const = default;

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

    bool is_equivalent_to(const ContentAddressedCache& other) const;

  private:
    struct Journal {
        // Captures the tree's metadata at the time of checkpoint
        TreeMeta meta_;
        // Captures the cache's node hashes at the time of checkpoint. If the node does not exist in the cache, the
        // optional will == nullopt
        std::vector<std::unordered_map<index_t, std::optional<fr>>> nodes_by_index_;
        // Captures the cache's leaf pre-images at the time of checkpoint. Again, if the leaf does not exist in the
        // cache, the optional will == nullopt
        std::unordered_map<index_t, std::optional<IndexedLeafValueType>> leaf_pre_image_by_index_;

        Journal(TreeMeta meta)
            : meta_(std::move(meta))
            , nodes_by_index_(meta_.depth + 1, std::unordered_map<index_t, std::optional<fr>>())
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
    journals_.emplace_back(Journal(meta_));
}

template <typename LeafValueType> void ContentAddressedCache<LeafValueType>::revert()
{
    if (journals_.empty()) {
        throw std::runtime_error("Cannot revert without a checkpoint");
    }
    // We need to iterate over the nodes and leaves and
    // 1. Remove any that were added since last checkpoint
    // 2. Restore any that were updated since last checkpoint
    // 3. Restore the meta data

    Journal& journal = journals_.back();

    for (uint32_t i = 0; i < journal.nodes_by_index_.size(); ++i) {
        for (const auto& [index, optional_node_hash] : journal.nodes_by_index_[i]) {
            // If the optional == nullopt then we remove it from the primary cache, it never existed before
            if (!optional_node_hash.has_value()) {
                nodes_by_index_[i].erase(index);
            } else {
                // The optional is not null, this means there is a vlue to be restored to the primary cache
                nodes_by_index_[i][index] = optional_node_hash.value();
            }
        }
    }

    for (const auto& [index, optional_leaf] : journal.leaf_pre_image_by_index_) {
        // If the option == nullopt then we remove it from the primary cache, it never existed before
        // Also remove from the indices store
        if (!optional_leaf.has_value()) {
            // We need to remove the leaf from the indices store
            auto cachedIter = leaf_pre_image_by_index_.find(index);
            if (cachedIter != leaf_pre_image_by_index_.end()) {
                indices_.erase(uint256_t(preimage_to_key(cachedIter->second.value)));
            }
            leaf_pre_image_by_index_.erase(index);
        } else {
            // There was a leaf pre-image, restore it to the primary cache
            // No need to update the indices store as the key has not changed
            leaf_pre_image_by_index_[index] = optional_leaf.value();
        }
    }

    // We need to restore the meta data
    meta_ = std::move(journal.meta_);
    journals_.pop_back();
}

template <typename LeafValueType> void ContentAddressedCache<LeafValueType>::commit()
{
    if (journals_.empty()) {
        throw std::runtime_error("Cannot commit without a checkpoint");
    }

    // We need to iterate over the nodes and leaves and merge them into the previous checkpoint if there is one
    // If there is no previous checkpoint then we just destroy the journal as the cache will be correct

    if (journals_.size() == 1) {
        journals_.clear();
        return;
    }

    Journal& currentJournal = journals_.back();
    Journal& previousJournal = journals_[journals_.size() - 2];

    for (uint32_t i = 0; i < currentJournal.nodes_by_index_.size(); ++i) {
        for (const auto& [index, optional_node_hash] : currentJournal.nodes_by_index_[i]) {
            // There is an entry in the current journal, if it does not exist in the previous journal then we need to
            // add it If it does exist in the previous journal then that journal already captured a value from the
            // primary cache that existed no later
            auto previousIter = previousJournal.nodes_by_index_[i].find(index);
            if (previousIter == previousJournal.nodes_by_index_[i].end()) {
                previousJournal.nodes_by_index_[i][index] = optional_node_hash;
            }
        }
    }

    for (const auto& [index, optional_leaf] : currentJournal.leaf_pre_image_by_index_) {
        // There is an entry in the current journal, if it does not exist in the previous journal then we need to add it
        // If it does exist in the previous journal then that journal already captured a value from the
        // primary cache that existed no later
        auto previousIter = previousJournal.leaf_pre_image_by_index_.find(index);
        if (previousIter == previousJournal.leaf_pre_image_by_index_.end()) {
            previousJournal.leaf_pre_image_by_index_[index] = optional_leaf;
        }
    }

    // We don't restore the meta here. We are committing, so the primary cached meta is correct
    journals_.pop_back();
}

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
bool ContentAddressedCache<LeafValueType>::is_equivalent_to(const ContentAddressedCache& other) const
{
    // Meta should be identical
    if (meta_ != other.meta_) {
        return false;
    }

    // Indices should be identical
    if (indices_ != other.indices_) {
        return false;
    }

    // Nodes by index should be identical
    if (nodes_by_index_ != other.nodes_by_index_) {
        return false;
    }

    // Leaf pre-images by index should be identical
    if (leaf_pre_image_by_index_ != other.leaf_pre_image_by_index_) {
        return false;
    }

    // Our leaves should be a subset of the other leaves
    for (const auto& [leaf_hash, leaf] : leaves_) {
        auto it = other.leaves_.find(leaf_hash);
        if (it == other.leaves_.end()) {
            return false;
        }
        if (it->second != leaf) {
            return false;
        }
    }

    // Our nodes should be a subset of the other nodes
    for (const auto& [node_hash, node] : nodes_) {
        auto it = other.nodes_.find(node_hash);
        if (it == other.nodes_.end()) {
            return false;
        }
        if (it->second != node) {
            return false;
        }
    }
    return true;
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
    // If there is no current journal then we just update the cache and leave
    if (journals_.empty()) {
        leaf_pre_image_by_index_[index] = leafPreImage;
        return;
    }

    // There is a journal, grab it
    Journal& journal = journals_.back();

    // If there is no leaf pre-image at the given index then add the index location to the journal's collection of empty
    // locations
    auto cacheIter = leaf_pre_image_by_index_.find(index);
    if (cacheIter == leaf_pre_image_by_index_.end()) {
        journal.leaf_pre_image_by_index_[index] = std::nullopt;
    } else {
        // There is a leaf pre-image. If the journal does not have a pre-image at this index then add it to the journal
        auto journalIter = journal.leaf_pre_image_by_index_.find(index);
        if (journalIter == journal.leaf_pre_image_by_index_.end()) {
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
    // If there is no current journal then we just update the cache and leave
    if (journals_.empty()) {
        nodes_by_index_[level][index] = node;
        return;
    }

    // There is a journal, grab it
    Journal& journal = journals_.back();

    // If there is no node at the given location then add a nullopt to the journal
    auto cacheIter = nodes_by_index_[level].find(index);
    if (cacheIter == nodes_by_index_[level].end()) {
        journal.nodes_by_index_[level][index] = std::nullopt;
    } else {
        // There is a node. If the journal does not have a node at this index then add it to the journal
        auto journalIter = journal.nodes_by_index_[level].find(index);
        if (journalIter == journal.nodes_by_index_[level].end()) {
            journal.nodes_by_index_[level][index] = cacheIter->second;
        }
    }
    nodes_by_index_[level][index] = node;
}
} // namespace bb::crypto::merkle_tree