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

/**
 * @brief Serves as a key-value node store for merkle trees. Caches all changes in memory before persisting them during
 * a 'commit' operation.
 * Manages the persisted store by seperating the key spaces as follows:
 * 1 byte key of 0: Tree meta data
 * 8 byte integers: The index of each leaf to the value of that leaf
 * 16 byte integers: Nodes in the tree, key value = ((2 ^ level) + index - 1)
 * 32 bytes integers: The value of the leaf (32 bytes) to the set of indices where the leaf exists in the tree.
 */
template <typename LeafValueType> class ContentAddressedCachedTreeStore {
  public:
    using PersistedStoreType = LMDBTreeStore;
    using LeafType = LeafValueType;
    using IndexedLeafValueType = IndexedLeaf<LeafValueType>;
    using ReadTransaction = typename PersistedStoreType::ReadTransaction;
    using WriteTransaction = typename PersistedStoreType::WriteTransaction;
    using ReadTransactionPtr = std::unique_ptr<ReadTransaction>;
    using WriteTransactionPtr = std::unique_ptr<WriteTransaction>;

    ContentAddressedCachedTreeStore(std::string name, uint32_t levels, PersistedStoreType::SharedPtr dataStore);
    ContentAddressedCachedTreeStore(std::string name,
                                    uint32_t levels,
                                    const index_t& referenceBlockNumber,
                                    PersistedStoreType::SharedPtr dataStore);
    ~ContentAddressedCachedTreeStore() = default;

    ContentAddressedCachedTreeStore() = delete;
    ContentAddressedCachedTreeStore(ContentAddressedCachedTreeStore const& other) = delete;
    ContentAddressedCachedTreeStore(ContentAddressedCachedTreeStore const&& other) = delete;
    ContentAddressedCachedTreeStore& operator=(ContentAddressedCachedTreeStore const& other) = delete;
    ContentAddressedCachedTreeStore& operator=(ContentAddressedCachedTreeStore const&& other) = delete;

    /**
     * @brief Returns the index of the leaf with a value immediately lower than the value provided
     */
    std::pair<bool, index_t> find_low_value(const fr& new_leaf_key,
                                            const RequestContext& requestContext,
                                            ReadTransaction& tx) const;

    /**
     * @brief Returns the leaf at the provided index, if one exists
     */
    std::optional<IndexedLeafValueType> get_leaf(const index_t& index,
                                                 ReadTransaction& tx,
                                                 bool includeUncommitted) const;

    /**
     * @brief Adds the leaf at the given index, updates the leaf index if requested
     */
    void set_leaf_key_at_index(const index_t& index, const IndexedLeafValueType& leaf);

    /**
     * @brief Updates the leaf index
     */
    void update_index(const index_t& index, const fr& leaf);

    /**
     * @brief Writes the provided data at the given node coordinates. Only writes to uncommitted data.
     */
    void put_node_by_hash(const fr& nodeHash, const NodePayload& payload);

    /**
     * @brief Returns the data at the given node coordinates if available. Reads from uncommitted state if requested.
     */
    bool get_node_by_hash(const fr& nodeHash,
                          NodePayload& payload,
                          ReadTransaction& transaction,
                          bool includeUncommitted) const;

    /**
     * @brief Writes the provided data at the given node coordinates. Only writes to uncommitted data.
     */
    void put_cached_node_by_index(uint32_t level, const index_t& index, const fr& data, bool overwriteIfPresent = true);

    /**
     * @brief Returns the data at the given node coordinates if available.
     */
    bool get_cached_node_by_index(uint32_t level, const index_t& index, fr& data) const;

    /**
     * @brief Writes the provided meta data to uncommitted state
     */
    void put_meta(const TreeMeta& m);

    /**
     * @brief Reads the tree meta data, including uncommitted data if requested
     */
    void get_meta(TreeMeta& m, ReadTransaction& tx, bool includeUncommitted) const;

    /**
     * @brief Reads the tree meta data, including uncommitted data if requested
     */
    bool get_block_data(const block_number_t& blockNumber, BlockPayload& blockData, ReadTransaction& tx) const;

    /**
     * @brief Finds the index of the given leaf value in the tree if available. Includes uncommitted data if requested.
     */
    std::optional<index_t> find_leaf_index(const LeafValueType& leaf,
                                           const RequestContext& requestContext,
                                           ReadTransaction& tx) const;

    /**
     * @brief Finds the index of the given leaf value in the tree if available. Includes uncommitted data if requested.
     */
    std::optional<index_t> find_leaf_index_from(const LeafValueType& leaf,
                                                const index_t& start_index,
                                                const RequestContext& requestContext,
                                                ReadTransaction& tx) const;

    /**
     * @brief Commits the uncommitted data to the underlying store
     */
    void commit(TreeMeta& finalMeta, TreeDBStats& dbStats, bool asBlock = true);

    /**
     * @brief Rolls back the uncommitted state
     */
    void rollback();

    /**
     * @brief Returns the name of the tree
     */
    std::string get_name() const { return forkConstantData_.name_; }

    /**
     * @brief Returns a read transaction against the underlying store.
     */
    ReadTransactionPtr create_read_transaction() const { return dataStore_->create_read_transaction(); }

    std::optional<IndexedLeafValueType> get_leaf_by_hash(const fr& leaf_hash,
                                                         ReadTransaction& tx,
                                                         bool includeUncommitted) const;

    void put_leaf_by_hash(const fr& leaf_hash, const IndexedLeafValueType& leafPreImage);

    std::optional<IndexedLeafValueType> get_cached_leaf_by_index(const index_t& index) const;

    void put_cached_leaf_by_index(const index_t& index, const IndexedLeafValueType& leafPreImage);

    fr get_current_root(ReadTransaction& tx, bool includeUncommitted) const;

    void remove_historical_block(const block_number_t& blockNumber, TreeMeta& finalMeta, TreeDBStats& dbStats);

    void unwind_block(const block_number_t& blockNumber, TreeMeta& finalMeta, TreeDBStats& dbStats);

    std::optional<index_t> get_fork_block() const;

    void advance_finalised_block(const block_number_t& blockNumber);

    std::optional<block_number_t> find_block_for_index(const index_t& index, ReadTransaction& tx) const;

  private:
    struct ForkConstantData {
        std::string name_;
        uint32_t depth_;
        std::optional<BlockPayload> initialised_from_block_;
    };
    ForkConstantData forkConstantData_;

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
    PersistedStoreType::SharedPtr dataStore_;
    TreeMeta meta_;
    mutable std::mutex mtx_;

    // The following stores are not persisted, just cached until commit
    std::vector<std::unordered_map<index_t, fr>> nodes_by_index_;
    std::unordered_map<index_t, IndexedLeafValueType> leaf_pre_image_by_index_;

    void initialise();

    void initialise_from_block(const block_number_t& blockNumber);

    bool read_persisted_meta(TreeMeta& m, ReadTransaction& tx) const;

    void enrich_meta_from_fork_constant_data(TreeMeta& m) const;

    void persist_meta(TreeMeta& m, WriteTransaction& tx);

    void persist_leaf_indices(WriteTransaction& tx);

    void persist_leaf_pre_image(const fr& hash, WriteTransaction& tx);

    void persist_node(const std::optional<fr>& optional_hash, uint32_t level, WriteTransaction& tx);

    void remove_node(const std::optional<fr>& optional_hash,
                     uint32_t level,
                     const std::optional<index_t>& maxIndex,
                     WriteTransaction& tx);

    void remove_leaf(const fr& hash, const std::optional<index_t>& maxIndex, WriteTransaction& tx);

    void remove_leaf_index(const fr& key, const index_t& maxIndex, WriteTransaction& tx);

    void extract_db_stats(TreeDBStats& stats);

    void persist_block_for_index(const block_number_t& blockNumber, const index_t& index, WriteTransaction& tx);

    void delete_block_for_index(const block_number_t& blockNumber, const index_t& index, WriteTransaction& tx);

    index_t constrain_tree_size_to_only_committed(const RequestContext& requestContext, ReadTransaction& tx) const;

    WriteTransactionPtr create_write_transaction() const { return dataStore_->create_write_transaction(); }
};

template <typename LeafValueType>
ContentAddressedCachedTreeStore<LeafValueType>::ContentAddressedCachedTreeStore(std::string name,
                                                                                uint32_t levels,
                                                                                PersistedStoreType::SharedPtr dataStore)
    : forkConstantData_{ .name_ = (std::move(name)), .depth_ = levels }
    , dataStore_(dataStore)
    , nodes_by_index_(std::vector<std::unordered_map<index_t, fr>>(levels + 1, std::unordered_map<index_t, fr>()))
{
    initialise();
}

template <typename LeafValueType>
ContentAddressedCachedTreeStore<LeafValueType>::ContentAddressedCachedTreeStore(std::string name,
                                                                                uint32_t levels,
                                                                                const index_t& referenceBlockNumber,
                                                                                PersistedStoreType::SharedPtr dataStore)
    : forkConstantData_{ .name_ = (std::move(name)), .depth_ = levels }
    , dataStore_(dataStore)
    , nodes_by_index_(std::vector<std::unordered_map<index_t, fr>>(levels + 1, std::unordered_map<index_t, fr>()))
{
    initialise_from_block(referenceBlockNumber);
}

template <typename LeafValueType>
index_t ContentAddressedCachedTreeStore<LeafValueType>::constrain_tree_size_to_only_committed(
    const RequestContext& requestContext, ReadTransaction& tx) const
{
    // We need to identify the size of the committed tree as it exists from our perspective
    // We either take from the fork's constant data if available or we read the meta data from the store
    index_t sizeLimit = 0;
    if (forkConstantData_.initialised_from_block_.has_value()) {
        // We are a fork. Take from constant data
        sizeLimit = forkConstantData_.initialised_from_block_.value().size;
    } else {
        // We are the main tree. Read from the store, only use committed so as to not violate any requests for purely
        // committed data
        TreeMeta m;
        get_meta(m, tx, false);
        sizeLimit = m.committedSize;
    }
    if (requestContext.maxIndex.has_value() && requestContext.maxIndex.value() < sizeLimit) {
        sizeLimit = requestContext.maxIndex.value();
    }
    return sizeLimit;
}

template <typename LeafValueType>
std::optional<block_number_t> ContentAddressedCachedTreeStore<LeafValueType>::find_block_for_index(
    const index_t& index, ReadTransaction& tx) const
{
    RequestContext context;
    context.maxIndex = index + 1;
    index_t constrainedSize = constrain_tree_size_to_only_committed(context, tx);
    if (index >= constrainedSize) {
        return std::nullopt;
    }
    block_number_t blockNumber = 0;
    bool success = dataStore_->find_block_for_index(index, blockNumber, tx);
    return success ? std::make_optional(blockNumber) : std::nullopt;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_block_for_index(const block_number_t& blockNumber,
                                                                             const index_t& index,
                                                                             WriteTransaction& tx)
{
    dataStore_->write_block_index_data(blockNumber, index, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::delete_block_for_index(const block_number_t& blockNumber,
                                                                            const index_t& index,
                                                                            WriteTransaction& tx)
{
    dataStore_->delete_block_index(index, blockNumber, tx);
}

template <typename LeafValueType>
std::pair<bool, index_t> ContentAddressedCachedTreeStore<LeafValueType>::find_low_value(
    const fr& new_leaf_key, const RequestContext& requestContext, ReadTransaction& tx) const
{
    auto new_value_as_number = uint256_t(new_leaf_key);
    index_t committed = 0;

    // We first read committed data, so we must constrin the search to only the data committed from our perspective
    // That means, if we are a fork, the committed size is the size of the tree as it was when we forked
    // If we are the main tree, the committed size is the size of the tree as it is now
    std::optional<index_t> sizeLimit = constrain_tree_size_to_only_committed(requestContext, tx);

    fr found_key = dataStore_->find_low_leaf(new_leaf_key, committed, sizeLimit, tx);
    index_t db_index = committed;
    uint256_t retrieved_value = found_key;

    // Accessing indices_ from here under a lock
    std::unique_lock lock(mtx_);
    if (!requestContext.includeUncommitted || retrieved_value == new_value_as_number || indices_.empty()) {
        return std::make_pair(new_value_as_number == retrieved_value, db_index);
    }

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
std::optional<typename ContentAddressedCachedTreeStore<LeafValueType>::IndexedLeafValueType>
ContentAddressedCachedTreeStore<LeafValueType>::get_leaf_by_hash(const fr& leaf_hash,
                                                                 ReadTransaction& tx,
                                                                 bool includeUncommitted) const
{
    std::optional<typename ContentAddressedCachedTreeStore<LeafValueType>::IndexedLeafValueType> leaf = std::nullopt;
    if (includeUncommitted) {
        // Accessing leaves_ here under a lock
        std::unique_lock lock(mtx_);
        typename std::unordered_map<fr, IndexedLeafValueType>::const_iterator it = leaves_.find(leaf_hash);
        if (it != leaves_.end()) {
            leaf = it->second;
            return leaf;
        }
    }
    IndexedLeafValueType leafData;
    bool success = dataStore_->read_leaf_by_hash(leaf_hash, leafData, tx);
    if (success) {
        leaf = leafData;
    }
    return leaf;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::put_leaf_by_hash(const fr& leaf_hash,
                                                                      const IndexedLeafValueType& leafPreImage)
{
    // Accessing leaves_ under a lock
    std::unique_lock lock(mtx_);
    leaves_[leaf_hash] = leafPreImage;
}

template <typename LeafValueType>
std::optional<typename ContentAddressedCachedTreeStore<LeafValueType>::IndexedLeafValueType>
ContentAddressedCachedTreeStore<LeafValueType>::get_cached_leaf_by_index(const index_t& index) const
{
    // Accessing leaf_pre_image_by_index_ under a lock
    std::unique_lock lock(mtx_);
    auto it = leaf_pre_image_by_index_.find(index);
    if (it == leaf_pre_image_by_index_.end()) {
        return std::nullopt;
    }
    return it->second;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::put_cached_leaf_by_index(const index_t& index,
                                                                              const IndexedLeafValueType& leafPreImage)
{
    // Accessing leaf_pre_image_by_index_ under a lock
    std::unique_lock lock(mtx_);
    leaf_pre_image_by_index_[index] = leafPreImage;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::set_leaf_key_at_index(const index_t& index,
                                                                           const IndexedLeafValueType& leaf)
{
    // std::cout << "Set leaf key at index " << index << std::endl;
    update_index(index, leaf.value.get_key());
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::update_index(const index_t& index, const fr& leaf)
{
    // std::cout << "update_index at index " << index << " leaf " << leaf << std::endl;
    //  Accessing indices_ under a lock
    std::unique_lock lock(mtx_);
    indices_.insert({ uint256_t(leaf), index });
}

template <typename LeafValueType>
std::optional<index_t> ContentAddressedCachedTreeStore<LeafValueType>::find_leaf_index(
    const LeafValueType& leaf, const RequestContext& requestContext, ReadTransaction& tx) const
{
    return find_leaf_index_from(leaf, 0, requestContext, tx);
}

template <typename LeafValueType>
std::optional<index_t> ContentAddressedCachedTreeStore<LeafValueType>::find_leaf_index_from(
    const LeafValueType& leaf,
    const index_t& start_index,
    const RequestContext& requestContext,
    ReadTransaction& tx) const
{
    if (requestContext.includeUncommitted) {
        // Accessing indices_ under a lock
        std::unique_lock lock(mtx_);
        auto it = indices_.find(uint256_t(leaf));
        if (it != indices_.end()) {
            // we have an uncommitted value, we will return from here
            if (it->second >= start_index) {
                // we have a qualifying value
                return std::make_optional(it->second);
            }
            return std::nullopt;
        }
    }

    // we have been asked to not include uncommitted data, or there is none available
    index_t committed = 0;
    FrKeyType key = leaf;
    bool success = dataStore_->read_leaf_index(key, committed, tx);
    if (success) {
        // We must constrin the search to only the data committed from our perspective
        // That means, if we are a fork, the committed size is the size of the tree as it was when we forked
        // If we are the main tree, the committed size is the size of the tree as it is now
        index_t sizeLimit = constrain_tree_size_to_only_committed(requestContext, tx);
        if (committed < start_index) {
            return std::nullopt;
        }
        if (committed >= sizeLimit) {
            return std::nullopt;
        }
        return std::make_optional(committed);
    }
    return std::nullopt;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::put_node_by_hash(const fr& nodeHash, const NodePayload& payload)
{
    // Accessing nodes_ under a lock
    std::unique_lock lock(mtx_);
    nodes_[nodeHash] = payload;
}

template <typename LeafValueType>
bool ContentAddressedCachedTreeStore<LeafValueType>::get_node_by_hash(const fr& nodeHash,
                                                                      NodePayload& payload,
                                                                      ReadTransaction& transaction,
                                                                      bool includeUncommitted) const
{
    if (includeUncommitted) {
        // Accessing nodes_ under a lock
        std::unique_lock lock(mtx_);
        auto it = nodes_.find(nodeHash);
        if (it != nodes_.end()) {
            payload = it->second;
            return true;
        }
    }
    return dataStore_->read_node(nodeHash, payload, transaction);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::put_cached_node_by_index(uint32_t level,
                                                                              const index_t& index,
                                                                              const fr& data,
                                                                              bool overwriteIfPresent)
{
    // Accessing nodes_by_index_ under a lock
    std::unique_lock lock(mtx_);
    if (!overwriteIfPresent) {
        const auto& level_map = nodes_by_index_[level];
        auto it = level_map.find(index);
        if (it != level_map.end()) {
            return;
        }
    }
    nodes_by_index_[level][index] = data;
}

template <typename LeafValueType>
bool ContentAddressedCachedTreeStore<LeafValueType>::get_cached_node_by_index(uint32_t level,
                                                                              const index_t& index,
                                                                              fr& data) const
{
    // Accessing nodes_by_index_ under a lock
    std::unique_lock lock(mtx_);
    const auto& level_map = nodes_by_index_[level];
    auto it = level_map.find(index);
    if (it == level_map.end()) {
        return false;
    }
    data = it->second;
    return true;
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::put_meta(const TreeMeta& m)
{
    // Accessing meta_ under a lock
    std::unique_lock lock(mtx_);
    meta_ = m;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::get_meta(TreeMeta& m,
                                                              ReadTransaction& tx,
                                                              bool includeUncommitted) const
{
    if (includeUncommitted) {
        // Accessing meta_ under a lock
        std::unique_lock lock(mtx_);
        m = meta_;
        return;
    }
    read_persisted_meta(m, tx);
}

template <typename LeafValueType>
bool ContentAddressedCachedTreeStore<LeafValueType>::get_block_data(const block_number_t& blockNumber,
                                                                    BlockPayload& blockData,
                                                                    ReadTransaction& tx) const
{
    return dataStore_->read_block_data(blockNumber, blockData, tx);
}

template <typename LeafValueType>
bool ContentAddressedCachedTreeStore<LeafValueType>::read_persisted_meta(TreeMeta& m, ReadTransaction& tx) const
{
    if (!dataStore_->read_meta_data(m, tx)) {
        return false;
    }
    // Having read the meta from the store, we need to enrich it with the fork constant data if available
    enrich_meta_from_fork_constant_data(m);
    return true;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::enrich_meta_from_fork_constant_data(TreeMeta& m) const
{
    // Here we update the given meta with properties from our constant fork data if available.
    // If we are not a fork then nothing is to be updated
    // If we are a fork then we will overwrite the root, size and committed size with the original fork values
    if (forkConstantData_.initialised_from_block_.has_value()) {
        m.size = forkConstantData_.initialised_from_block_->size;
        m.committedSize = forkConstantData_.initialised_from_block_->size;
        m.root = forkConstantData_.initialised_from_block_->root;
        m.unfinalisedBlockHeight = forkConstantData_.initialised_from_block_->blockNumber;
    }
}

template <typename LeafValueType>
fr ContentAddressedCachedTreeStore<LeafValueType>::get_current_root(ReadTransaction& tx, bool includeUncommitted) const
{
    if (includeUncommitted) {
        fr root = fr::zero();
        if (get_cached_node_by_index(0, 0, root)) {
            return root;
        }
    }
    TreeMeta meta;
    get_meta(meta, tx, includeUncommitted);
    return meta.root;
}

// The following functions are related to either initialisation or committing data
// It is assumed that when these operations are being executed that no other state accessing operations
// are in progress, hence no data synchronisation is used.

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::commit(TreeMeta& finalMeta, TreeDBStats& dbStats, bool asBlock)
{
    bool dataPresent = false;
    TreeMeta uncommittedMeta;
    TreeMeta committedMeta;
    // We don't allow commits using images/forks
    if (forkConstantData_.initialised_from_block_.has_value()) {
        throw std::runtime_error("Committing a fork is forbidden");
    }
    {
        ReadTransactionPtr tx = create_read_transaction();
        // read both committed and uncommitted meta data
        get_meta(uncommittedMeta, *tx, true);
        get_meta(committedMeta, *tx, false);

        // if the meta datas are different, we have uncommitted data
        bool metaToCommit = committedMeta != uncommittedMeta;
        if (!metaToCommit && !asBlock) {
            return;
        }

        auto currentRootIter = nodes_.find(uncommittedMeta.root);
        dataPresent = currentRootIter != nodes_.end();
    }
    {
        WriteTransactionPtr tx = create_write_transaction();
        try {
            if (dataPresent) {
                // std::cout << "Persisting data for block " << uncommittedMeta.unfinalisedBlockHeight + 1 << std::endl;
                persist_leaf_indices(*tx);
            }
            // If we are commiting a block, we need to persist the root, since the new block "references" this root
            // However, if the root is the empty root we can't persist it, since it's not a real node
            // We are abusing the trees in some tests, trying to add empty blocks to initial empty trees
            // That is not expected behavior since the unwind operation will fail trying to decrease refcount
            // for the empty root, which doesn't exist.
            if (dataPresent || (asBlock && uncommittedMeta.size > 0)) {
                persist_node(std::optional<fr>(uncommittedMeta.root), 0, *tx);
            }
            if (asBlock) {
                ++uncommittedMeta.unfinalisedBlockHeight;
                if (uncommittedMeta.oldestHistoricBlock == 0) {
                    uncommittedMeta.oldestHistoricBlock = 1;
                }
                // std::cout << "New root " << uncommittedMeta.root << std::endl;
                BlockPayload block{ .size = uncommittedMeta.size,
                                    .blockNumber = uncommittedMeta.unfinalisedBlockHeight,
                                    .root = uncommittedMeta.root };
                dataStore_->write_block_data(uncommittedMeta.unfinalisedBlockHeight, block, *tx);
                dataStore_->write_block_index_data(block.blockNumber, block.size, *tx);
            }

            uncommittedMeta.committedSize = uncommittedMeta.size;
            persist_meta(uncommittedMeta, *tx);
            tx->commit();
        } catch (std::exception& e) {
            tx->try_abort();
            throw std::runtime_error(
                format("Unable to commit data to tree: ", forkConstantData_.name_, " Error: ", e.what()));
        }
    }
    finalMeta = uncommittedMeta;

    // rolling back destroys all cache stores and also refreshes the cached meta_ from persisted state
    rollback();

    extract_db_stats(dbStats);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::extract_db_stats(TreeDBStats& stats)
{
    try {
        ReadTransactionPtr tx = create_read_transaction();
        dataStore_->get_stats(stats, *tx);
    } catch (std::exception&) {
    }
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_leaf_indices(WriteTransaction& tx)
{
    for (auto& idx : indices_) {
        FrKeyType key = idx.first;
        dataStore_->write_leaf_index(key, idx.second, tx);
    }
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_leaf_pre_image(const fr& hash, WriteTransaction& tx)
{
    // Now persist the leaf pre-image
    auto leafPreImageIter = leaves_.find(hash);
    if (leafPreImageIter == leaves_.end()) {
        return;
    }
    dataStore_->write_leaf_by_hash(hash, leafPreImageIter->second, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_node(const std::optional<fr>& optional_hash,
                                                                  uint32_t level,
                                                                  WriteTransaction& tx)
{
    struct StackObject {
        std::optional<fr> opHash;
        uint32_t lvl;
    };
    std::vector<StackObject> stack;
    stack.push_back({ .opHash = optional_hash, .lvl = level });

    while (!stack.empty()) {
        StackObject so = stack.back();
        stack.pop_back();

        // If the optional hash does not have a value then it means it's the zero tree value at this level
        // If it has a value but that value is not in our stores then it means it is referencing a node
        // created in a previous block, so that will need to have it's reference count increased
        if (!so.opHash.has_value()) {
            continue;
        }
        fr hash = so.opHash.value();

        if (so.lvl == forkConstantData_.depth_) {
            // this is a leaf
            persist_leaf_pre_image(hash, tx);
        }

        // std::cout << "Persisting node hash " << hash << " at level " << so.lvl << std::endl;
        auto nodePayloadIter = nodes_.find(hash);
        if (nodePayloadIter == nodes_.end()) {
            //  need to increase the stored node's reference count here
            dataStore_->increment_node_reference_count(hash, tx);
            continue;
        }

        NodePayload nodeData = nodePayloadIter->second;
        dataStore_->set_or_increment_node_reference_count(hash, nodeData, tx);
        if (nodeData.ref != 1) {
            // If the node now has a ref count greater then 1, we don't continue.
            // It means that the entire sub-tree underneath already exists
            continue;
        }
        stack.push_back({ .opHash = nodePayloadIter->second.left, .lvl = so.lvl + 1 });
        stack.push_back({ .opHash = nodePayloadIter->second.right, .lvl = so.lvl + 1 });
    }
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::rollback()
{
    // Extract the committed meta data and destroy the cache
    {
        ReadTransactionPtr tx = create_read_transaction();
        read_persisted_meta(meta_, *tx);
    }
    nodes_ = std::unordered_map<fr, NodePayload>();
    indices_ = std::map<uint256_t, index_t>();
    leaves_ = std::unordered_map<fr, IndexedLeafValueType>();
    nodes_by_index_ =
        std::vector<std::unordered_map<index_t, fr>>(forkConstantData_.depth_ + 1, std::unordered_map<index_t, fr>());
    leaf_pre_image_by_index_ = std::unordered_map<index_t, IndexedLeafValueType>();
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_meta(TreeMeta& m, WriteTransaction& tx)
{
    dataStore_->write_meta_data(m, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::advance_finalised_block(const block_number_t& blockNumber)
{
    TreeMeta committedMeta;
    TreeMeta uncommittedMeta;
    BlockPayload blockPayload;
    if (blockNumber < 1) {
        throw std::runtime_error(
            format("Unable to advance finalised block: ", blockNumber, ". Tree name: ", forkConstantData_.name_));
    }
    if (forkConstantData_.initialised_from_block_.has_value()) {
        throw std::runtime_error("Advancing the finalised block on a fork is forbidden");
    }
    {
        // read both committed and uncommitted meta values
        ReadTransactionPtr tx = create_read_transaction();
        get_meta(uncommittedMeta, *tx, true);
        get_meta(committedMeta, *tx, false);
        if (!dataStore_->read_block_data(blockNumber, blockPayload, *tx)) {
            throw std::runtime_error(format("Unable to advance finalised block: ",
                                            blockNumber,
                                            ". Failed to read block data. Tree name: ",
                                            forkConstantData_.name_));
        }
    }
    // can only finalise blocks that are not finalised
    if (committedMeta.finalisedBlockHeight >= blockNumber) {
        throw std::runtime_error(format("Unable to finalise block ",
                                        blockNumber,
                                        " currently finalised block height ",
                                        committedMeta.finalisedBlockHeight));
    }

    // can currently only finalise up to the unfinalised block height
    if (committedMeta.finalisedBlockHeight > committedMeta.unfinalisedBlockHeight) {
        throw std::runtime_error(format("Unable to finalise block ",
                                        blockNumber,
                                        " currently unfinalised block height ",
                                        committedMeta.finalisedBlockHeight));
    }

    // commit the new finalised block
    WriteTransactionPtr writeTx = create_write_transaction();
    try {
        committedMeta.finalisedBlockHeight = blockNumber;
        // persist the new meta data
        persist_meta(committedMeta, *writeTx);
        writeTx->commit();
    } catch (std::exception& e) {
        writeTx->try_abort();
        throw std::runtime_error(format("Unable to commit advance of finalised block: ",
                                        blockNumber,
                                        ". Tree name: ",
                                        forkConstantData_.name_,
                                        " Error: ",
                                        e.what()));
    }

    // commit successful, now also update the uncommitted meta
    uncommittedMeta.finalisedBlockHeight = committedMeta.finalisedBlockHeight;
    put_meta(uncommittedMeta);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::unwind_block(const block_number_t& blockNumber,
                                                                  TreeMeta& finalMeta,
                                                                  TreeDBStats& dbStats)
{
    TreeMeta uncommittedMeta;
    TreeMeta committedMeta;
    BlockPayload blockData;
    BlockPayload previousBlockData;
    if (blockNumber < 1) {
        throw std::runtime_error(
            format("Unable to unwind block: ", blockNumber, ". Tree name: ", forkConstantData_.name_));
    }
    if (forkConstantData_.initialised_from_block_.has_value()) {
        throw std::runtime_error("Removing a block on a fork is forbidden");
    }
    {
        ReadTransactionPtr tx = create_read_transaction();
        get_meta(uncommittedMeta, *tx, true);
        get_meta(committedMeta, *tx, false);
        if (committedMeta != uncommittedMeta) {
            throw std::runtime_error(
                format("Unable to unwind block: ",
                       blockNumber,
                       " Can't unwind with uncommitted data, first rollback before unwinding. Tree name: ",
                       forkConstantData_.name_));
        }
        if (blockNumber != uncommittedMeta.unfinalisedBlockHeight) {
            throw std::runtime_error(format("Unable to unwind block: ",
                                            blockNumber,
                                            " unfinalisedBlockHeight: ",
                                            committedMeta.unfinalisedBlockHeight,
                                            ". Tree name: ",
                                            forkConstantData_.name_));
        }
        if (blockNumber <= uncommittedMeta.finalisedBlockHeight) {
            throw std::runtime_error(format("Unable to unwind block: ",
                                            blockNumber,
                                            " finalisedBlockHeight: ",
                                            committedMeta.finalisedBlockHeight,
                                            ". Tree name: ",
                                            forkConstantData_.name_));
        }

        // populate the required data for the previous block
        if (blockNumber == 1) {
            previousBlockData.root = uncommittedMeta.initialRoot;
            previousBlockData.size = uncommittedMeta.initialSize;
            previousBlockData.blockNumber = 0;
        } else if (!dataStore_->read_block_data(blockNumber - 1, previousBlockData, *tx)) {
            throw std::runtime_error(format("Unable to unwind block: ",
                                            blockNumber,
                                            ". Failed to read previous block data. Tree name: ",
                                            forkConstantData_.name_));
        }

        // now get the root for the block we want to unwind
        if (!dataStore_->read_block_data(blockNumber, blockData, *tx)) {
            throw std::runtime_error(format("Unable to unwind block: ",
                                            blockNumber,
                                            ". Failed to read block data. Tree name: ",
                                            forkConstantData_.name_));
        }
    }
    WriteTransactionPtr writeTx = create_write_transaction();
    try {
        // std::cout << "Removing block " << blockNumber << std::endl;

        // Remove the block's node and leaf data given the max index of the previous block
        std::optional<index_t> maxIndex = std::optional<index_t>(previousBlockData.size);
        remove_node(std::optional<fr>(blockData.root), 0, maxIndex, *writeTx);
        // remove the block from the block data table
        dataStore_->delete_block_data(blockNumber, *writeTx);
        dataStore_->delete_block_index(blockData.size, blockData.blockNumber, *writeTx);
        uncommittedMeta.unfinalisedBlockHeight = previousBlockData.blockNumber;
        uncommittedMeta.size = previousBlockData.size;
        uncommittedMeta.committedSize = previousBlockData.size;
        uncommittedMeta.root = previousBlockData.root;
        // std::cout << "New block root " << previousBlockData.root << std::endl;
        //  commit this new meta data
        persist_meta(uncommittedMeta, *writeTx);
        writeTx->commit();
    } catch (std::exception& e) {
        writeTx->try_abort();
        throw std::runtime_error(format("Unable to commit unwind of block: ",
                                        blockNumber,
                                        ". Tree name: ",
                                        forkConstantData_.name_,
                                        " Error: ",
                                        e.what()));
    }

    // now update the uncommitted meta
    put_meta(uncommittedMeta);
    finalMeta = uncommittedMeta;

    extract_db_stats(dbStats);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::remove_historical_block(const block_number_t& blockNumber,
                                                                             TreeMeta& finalMeta,
                                                                             TreeDBStats& dbStats)
{
    TreeMeta committedMeta;
    TreeMeta uncommittedMeta;
    BlockPayload blockData;
    if (blockNumber < 1) {
        throw std::runtime_error(
            format("Unable to remove historical block: ", blockNumber, ". Tree name: ", forkConstantData_.name_));
    }
    if (forkConstantData_.initialised_from_block_.has_value()) {
        throw std::runtime_error("Removing a block on a fork is forbidden");
    }
    {
        // retrieve both the committed and uncommitted meta data, validate the provide block is the oldest historical
        // block
        ReadTransactionPtr tx = create_read_transaction();
        get_meta(uncommittedMeta, *tx, true);
        get_meta(committedMeta, *tx, false);
        if (blockNumber != committedMeta.oldestHistoricBlock) {
            throw std::runtime_error(format("Unable to remove historical block: ",
                                            blockNumber,
                                            " oldestHistoricBlock: ",
                                            committedMeta.oldestHistoricBlock,
                                            ". Tree name: ",
                                            forkConstantData_.name_));
        }
        if (blockNumber >= committedMeta.finalisedBlockHeight) {
            throw std::runtime_error(format("Unable to remove historical block: ",
                                            blockNumber,
                                            " oldestHistoricBlock: ",
                                            committedMeta.finalisedBlockHeight,
                                            ". Tree name: ",
                                            forkConstantData_.name_));
        }

        if (!dataStore_->read_block_data(blockNumber, blockData, *tx)) {
            throw std::runtime_error(format("Unable to remove historical block: ",
                                            blockNumber,
                                            ". Failed to read block data. Tree name: ",
                                            forkConstantData_.name_));
        }
    }
    WriteTransactionPtr writeTx = create_write_transaction();
    try {
        std::optional<index_t> maxIndex = std::nullopt;
        // remove the historical block's node data
        remove_node(std::optional<fr>(blockData.root), 0, maxIndex, *writeTx);
        // remove the block's entry in the block table
        dataStore_->delete_block_data(blockNumber, *writeTx);
        // increment the oldest historical block number as committed data
        committedMeta.oldestHistoricBlock++;
        persist_meta(committedMeta, *writeTx);
        writeTx->commit();
    } catch (std::exception& e) {
        writeTx->try_abort();
        throw std::runtime_error(format("Unable to commit removal of historical block: ",
                                        blockNumber,
                                        ". Tree name: ",
                                        forkConstantData_.name_,
                                        " Error: ",
                                        e.what()));
    }

    // commit was successful, update the uncommitted meta
    uncommittedMeta.oldestHistoricBlock = committedMeta.oldestHistoricBlock;
    put_meta(uncommittedMeta);
    finalMeta = uncommittedMeta;

    extract_db_stats(dbStats);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::remove_leaf_index(const fr& key,
                                                                       const index_t& maxIndex,
                                                                       WriteTransaction& tx)
{
    // We now have the key, extract the index
    index_t index = 0;
    // std::cout << "Reading index for key " << key << std::endl;
    if (dataStore_->read_leaf_index(key, index, tx)) {
        if (index >= maxIndex) {
            // std::cout << "Deleting index" << std::endl;
            dataStore_->delete_leaf_index(key, tx);
        }
    }
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::remove_leaf(const fr& hash,
                                                                 const std::optional<index_t>& maxIndex,
                                                                 WriteTransaction& tx)
{
    // std::cout << "Removing leaf " << hash << std::endl;
    if (maxIndex.has_value()) {
        // std::cout << "Max Index" << std::endl;
        //   We need to clear the entry from the leaf key to index database as this leaf never existed
        IndexedLeafValueType leaf;
        fr key;
        if (requires_preimage_for_key<LeafValueType>()) {
            // std::cout << "Reading leaf by hash " << hash << std::endl;
            if (!dataStore_->read_leaf_by_hash(hash, leaf, tx)) {
                throw std::runtime_error("Failed to find leaf pre-image when attempting to delete indices");
            }
            // std::cout << "Read leaf by hash " << hash << std::endl;
            key = preimage_to_key(leaf.value);
        } else {
            key = hash;
        }
        remove_leaf_index(key, maxIndex.value(), tx);
    }
    // std::cout << "Deleting leaf by hash " << std::endl;
    dataStore_->delete_leaf_by_hash(hash, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::remove_node(const std::optional<fr>& optional_hash,
                                                                 uint32_t level,
                                                                 const std::optional<index_t>& maxIndex,
                                                                 WriteTransaction& tx)
{
    struct StackObject {
        std::optional<fr> opHash;
        uint32_t lvl;
    };
    std::vector<StackObject> stack;
    stack.push_back({ .opHash = optional_hash, .lvl = level });

    while (!stack.empty()) {
        StackObject so = stack.back();
        stack.pop_back();

        if (!so.opHash.has_value()) {
            continue;
        }
        fr hash = so.opHash.value();
        // we need to retrieve the node and decrement it's reference count
        // std::cout << "Decrementing ref count for node " << hash << ", level " << so.lvl << std::endl;
        NodePayload nodeData;
        dataStore_->decrement_node_reference_count(hash, nodeData, tx);

        if (nodeData.ref != 0) {
            // node was not deleted, we don't continue the search
            continue;
        }
        // the node was deleted, if it was a leaf then we need to remove the pre-image
        if (so.lvl == forkConstantData_.depth_) {
            remove_leaf(hash, maxIndex, tx);
        }
        // push the child nodes to the stack
        stack.push_back({ .opHash = std::optional<fr>(nodeData.left), .lvl = so.lvl + 1 });
        stack.push_back({ .opHash = std::optional<fr>(nodeData.right), .lvl = so.lvl + 1 });
    }
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::initialise()
{
    // Read the persisted meta data, if the name or depth of the tree is not consistent with what was provided during
    // construction then we throw
    std::vector<uint8_t> data;
    {
        ReadTransactionPtr tx = create_read_transaction();
        bool success = read_persisted_meta(meta_, *tx);
        if (success) {
            if (forkConstantData_.name_ == meta_.name && forkConstantData_.depth_ == meta_.depth) {
                return;
            }
            throw std::runtime_error(
                format("Tree found to be uninitialised when attempting to create ", forkConstantData_.name_));
        }
    }

    // No meta data available. Write the initial state down
    meta_.name = forkConstantData_.name_;
    meta_.size = 0;
    meta_.committedSize = 0;
    meta_.root = fr::zero();
    meta_.initialRoot = fr::zero();
    meta_.depth = forkConstantData_.depth_;
    meta_.initialSize = 0;
    meta_.oldestHistoricBlock = 0;
    meta_.unfinalisedBlockHeight = 0;
    meta_.finalisedBlockHeight = 0;
    WriteTransactionPtr tx = create_write_transaction();
    try {
        persist_meta(meta_, *tx);
        tx->commit();
    } catch (std::exception& e) {
        tx->try_abort();
        throw e;
    }
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::initialise_from_block(const block_number_t& blockNumber)
{
    // Read the persisted meta data, if the name or depth of the tree is not consistent with what was provided during
    // construction then we throw
    std::vector<uint8_t> data;
    {
        ReadTransactionPtr tx = create_read_transaction();
        bool success = read_persisted_meta(meta_, *tx);
        if (success) {
            if (forkConstantData_.name_ != meta_.name || forkConstantData_.depth_ != meta_.depth) {
                throw std::runtime_error(format("Inconsistent tree meta data when initialising ",
                                                forkConstantData_.name_,
                                                " with depth ",
                                                forkConstantData_.depth_,
                                                " from block ",
                                                blockNumber,
                                                " stored name: ",
                                                meta_.name,
                                                "stored depth: ",
                                                meta_.depth));
            }

        } else {
            throw std::runtime_error(format("Tree found to be uninitialised when attempting to create ",
                                            forkConstantData_.name_,
                                            " from block ",
                                            blockNumber));
        }

        if (meta_.unfinalisedBlockHeight < blockNumber) {
            throw std::runtime_error(format("Unable to initialise from future block: ",
                                            blockNumber,
                                            " unfinalisedBlockHeight: ",
                                            meta_.unfinalisedBlockHeight,
                                            ". Tree name: ",
                                            forkConstantData_.name_));
        }
        if (meta_.oldestHistoricBlock > blockNumber && blockNumber != 0) {
            throw std::runtime_error(format("Unable to fork from expired historical block: ",
                                            blockNumber,
                                            " unfinalisedBlockHeight: ",
                                            meta_.oldestHistoricBlock,
                                            ". Tree name: ",
                                            forkConstantData_.name_));
        }
        BlockPayload blockData;
        if (blockNumber == 0) {
            blockData.blockNumber = 0;
            blockData.root = meta_.initialRoot;
            blockData.size = meta_.initialSize;
        } else if (get_block_data(blockNumber, blockData, *tx) == false) {
            throw std::runtime_error(
                format("Failed to retrieve block data: ", blockNumber, ". Tree name: ", forkConstantData_.name_));
        }
        forkConstantData_.initialised_from_block_ = blockData;
        // Ensure the meta reflects the fork constant data
        enrich_meta_from_fork_constant_data(meta_);
    }
}

template <typename LeafValueType>
std::optional<index_t> ContentAddressedCachedTreeStore<LeafValueType>::get_fork_block() const
{
    if (forkConstantData_.initialised_from_block_.has_value()) {
        return forkConstantData_.initialised_from_block_->blockNumber;
    }
    return std::nullopt;
}

} // namespace bb::crypto::merkle_tree
