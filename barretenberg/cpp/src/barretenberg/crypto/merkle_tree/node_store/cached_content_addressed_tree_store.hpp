// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "./tree_meta.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/content_addressed_cache.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/lmdb_transaction.hpp"
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
                                    const block_number_t& referenceBlockNumber,
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
     * @brief Reads the uncommitted tree meta data
     */
    void get_meta(TreeMeta& m) const;

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
    void commit_block(TreeMeta& finalMeta, TreeDBStats& dbStats);

    /**
     * @brief Commits the initial state of uncommitted data to the underlying store
     */
    void commit_genesis_state();

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

    void advance_finalised_block(const block_number_t& blockNumber);

    std::optional<block_number_t> find_block_for_index(const index_t& index, ReadTransaction& tx) const;

    void checkpoint();
    void revert_checkpoint();
    void commit_checkpoint();
    void revert_all_checkpoints();
    void commit_all_checkpoints();

  private:
    using Cache = ContentAddressedCache<LeafValueType>;

    struct ForkConstantData {
        std::string name_;
        uint32_t depth_;
        std::optional<BlockPayload> initialised_from_block_;
    };
    ForkConstantData forkConstantData_;
    mutable std::mutex mtx_;

    PersistedStoreType::SharedPtr dataStore_;

    Cache cache_;

    void initialise();

    void initialise_from_block(const block_number_t& blockNumber);

    bool read_persisted_meta(TreeMeta& m, ReadTransaction& tx) const;

    void enrich_meta_from_fork_constant_data(TreeMeta& m) const;

    void persist_meta(TreeMeta& m, WriteTransaction& tx);

    void persist_node(const std::optional<fr>& optional_hash, uint32_t level, WriteTransaction& tx);

    void remove_node(const std::optional<fr>& optional_hash,
                     uint32_t level,
                     const std::optional<index_t>& maxIndex,
                     WriteTransaction& tx);

    void remove_leaf(const fr& hash, const std::optional<index_t>& maxIndex, WriteTransaction& tx);

    void remove_leaf_index(const fr& key, const index_t& maxIndex, WriteTransaction& tx);

    void extract_db_stats(TreeDBStats& stats);

    void extract_db_stats(TreeDBStats& stats, ReadTransaction& tx);

    void persist_block_for_index(const block_number_t& blockNumber, const index_t& index, WriteTransaction& tx);

    void persist_leaf_indices(WriteTransaction& tx);

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
    , cache_(levels)
{
    initialise();
}

template <typename LeafValueType>
ContentAddressedCachedTreeStore<LeafValueType>::ContentAddressedCachedTreeStore(
    std::string name,
    uint32_t levels,
    const block_number_t& referenceBlockNumber,
    PersistedStoreType::SharedPtr dataStore)
    : forkConstantData_{ .name_ = (std::move(name)), .depth_ = levels }
    , dataStore_(dataStore)
    , cache_(levels)
{
    initialise_from_block(referenceBlockNumber);
}

// Much Like the commit/rollback/set finalised/remove historic blocks apis
// These 3 apis (checkpoint/revert_checkpoint/commit_checkpoint) all assume they are not called
// during the process of reading/writing uncommitted state
// This is reasonable, they intended for use by forks at the point of starting/ending a function call
template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::checkpoint()
{
    cache_.checkpoint();
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::revert_checkpoint()
{
    cache_.revert();
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::commit_checkpoint()
{
    cache_.commit();
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::revert_all_checkpoints()
{
    cache_.revert_all();
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::commit_all_checkpoints()
{
    cache_.commit_all();
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

    // If we already found the leaf then return it.
    bool already_present = retrieved_value == new_value_as_number;
    if (already_present) {
        return std::make_pair(true, db_index);
    }

    // If we were asked not to include uncommitted then return what we have
    if (!requestContext.includeUncommitted) {
        return std::make_pair(false, db_index);
    }

    // Accessing the cache from here under a lock
    std::unique_lock lock(mtx_);
    return cache_.find_low_value(new_leaf_key, retrieved_value, db_index);
}

template <typename LeafValueType>
std::optional<typename ContentAddressedCachedTreeStore<LeafValueType>::IndexedLeafValueType>
ContentAddressedCachedTreeStore<LeafValueType>::get_leaf_by_hash(const fr& leaf_hash,
                                                                 ReadTransaction& tx,
                                                                 bool includeUncommitted) const
{
    IndexedLeafValueType leafData;
    if (includeUncommitted) {
        // Accessing the cache here under a lock
        std::unique_lock lock(mtx_);
        if (cache_.get_leaf_preimage_by_hash(leaf_hash, leafData)) {
            return leafData;
        }
    }
    if (dataStore_->read_leaf_by_hash(leaf_hash, leafData, tx)) {
        return leafData;
    }
    return std::nullopt;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::put_leaf_by_hash(const fr& leaf_hash,
                                                                      const IndexedLeafValueType& leafPreImage)
{
    // Accessing the cache under a lock
    std::unique_lock lock(mtx_);
    cache_.put_leaf_preimage_by_hash(leaf_hash, leafPreImage);
}

template <typename LeafValueType>
std::optional<typename ContentAddressedCachedTreeStore<LeafValueType>::IndexedLeafValueType>
ContentAddressedCachedTreeStore<LeafValueType>::get_cached_leaf_by_index(const index_t& index) const
{
    // Accessing the cache under a lock
    std::unique_lock lock(mtx_);
    IndexedLeafValueType leafPreImage;
    if (cache_.get_leaf_by_index(index, leafPreImage)) {
        return leafPreImage;
    }
    return std::nullopt;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::put_cached_leaf_by_index(const index_t& index,
                                                                              const IndexedLeafValueType& leafPreImage)
{
    // Accessing the cache under a lock
    std::unique_lock lock(mtx_);
    cache_.put_leaf_by_index(index, leafPreImage);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::set_leaf_key_at_index(const index_t& index,
                                                                           const IndexedLeafValueType& leaf)
{
    // std::cout << "Set leaf key at index " << index << std::endl;
    update_index(index, leaf.leaf.get_key());
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::update_index(const index_t& index, const fr& leaf)
{
    // std::cout << "update_index at index " << index << " leaf " << leaf << std::endl;
    //  Accessing the cache under a lock
    std::unique_lock lock(mtx_);
    cache_.update_leaf_key_index(index, leaf);
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
        // Accessing the cache under a lock
        std::unique_lock lock(mtx_);
        std::optional<index_t> cached = cache_.get_leaf_key_index(preimage_to_key(leaf));
        if (cached.has_value()) {
            // The is a cached value for the leaf
            // We will return from here regardless
            if (cached.value() >= start_index) {
                return cached;
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
    cache_.put_node(nodeHash, payload);
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
        if (cache_.get_node(nodeHash, payload)) {
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
    // Accessing the cache under a lock
    std::unique_lock lock(mtx_);
    if (!overwriteIfPresent) {
        std::optional<fr> cached = cache_.get_node_by_index(level, index);
        if (cached.has_value()) {
            return;
        }
    }
    cache_.put_node_by_index(level, index, data);
}

template <typename LeafValueType>
bool ContentAddressedCachedTreeStore<LeafValueType>::get_cached_node_by_index(uint32_t level,
                                                                              const index_t& index,
                                                                              fr& data) const
{
    // Accessing the cache under a lock
    std::unique_lock lock(mtx_);
    std::optional<fr> cached = cache_.get_node_by_index(level, index);
    if (cached.has_value()) {
        data = cached.value();
        return true;
    }
    return false;
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::put_meta(const TreeMeta& m)
{
    // Accessing the cache under a lock
    std::unique_lock lock(mtx_);
    cache_.put_meta(m);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::get_meta(TreeMeta& m,
                                                              ReadTransaction& tx,
                                                              bool includeUncommitted) const
{
    if (includeUncommitted) {
        get_meta(m);
        return;
    }
    read_persisted_meta(m, tx);
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::get_meta(TreeMeta& m) const
{
    // Accessing meta_ under a lock
    std::unique_lock lock(mtx_);
    m = cache_.get_meta();
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
// It is assumed that when these operations are being executed, no other state accessing operations
// are in progress, hence no data synchronisation is used.

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_leaf_indices(WriteTransaction& tx)
{
    const std::map<uint256_t, index_t>& indices = cache_.get_indices();
    for (const auto& idx : indices) {
        FrKeyType key = idx.first;
        dataStore_->write_leaf_index(key, idx.second, tx);
    }
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::commit_genesis_state()
{
    // In this call, we will store any node/leaf data that has been created so far
    bool dataPresent = false;
    TreeMeta meta;
    // We don't allow commits using images/forks
    if (forkConstantData_.initialised_from_block_.has_value()) {
        throw std::runtime_error("Committing a fork is forbidden");
    }
    get_meta(meta);
    NodePayload rootPayload;
    dataPresent = cache_.get_node(meta.root, rootPayload);
    {
        WriteTransactionPtr tx = create_write_transaction();
        try {
            if (dataPresent) {
                persist_leaf_indices(*tx);
                persist_node(std::optional<fr>(meta.root), 0, *tx);
            }

            meta.committedSize = meta.size;
            persist_meta(meta, *tx);
            tx->commit();
        } catch (std::exception& e) {
            tx->try_abort();
            throw std::runtime_error(
                format("Unable to commit genesis data to tree: ", forkConstantData_.name_, " Error: ", e.what()));
        }
    }
    // rolling back destroys all cache stores and also refreshes the cached meta_ from persisted state
    rollback();
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::commit_block(TreeMeta& finalMeta, TreeDBStats& dbStats)
{
    bool dataPresent = false;
    TreeMeta meta;

    // We don't allow commits using images/forks
    if (forkConstantData_.initialised_from_block_.has_value()) {
        throw std::runtime_error("Committing a fork is forbidden");
    }
    get_meta(meta);
    NodePayload rootPayload;
    dataPresent = cache_.get_node(meta.root, rootPayload);
    {
        WriteTransactionPtr tx = create_write_transaction();
        try {
            if (dataPresent) {
                // std::cout << "Persisting data for block " << uncommittedMeta.unfinalisedBlockHeight + 1 << std::endl;
                // Persist the leaf indices
                persist_leaf_indices(*tx);
            }
            // If we are commiting a block, we need to persist the root, since the new block "references" this root
            // However, if the root is the empty root we can't persist it, since it's not a real node and doesn't have
            // nodes beneath it. We coujld store a 'dummy' node to represent it but then we have to work around the
            // absence of a real tree elsewhere. So, if the tree is completely empty we do not store any node data, the
            // only issue is this needs to be recognised when we unwind or remove historic blocks i.e. there will be no
            // node date to remove for these blocks
            if (dataPresent || meta.size > 0) {
                persist_node(std::optional<fr>(meta.root), 0, *tx);
            }
            ++meta.unfinalisedBlockHeight;
            if (meta.oldestHistoricBlock == 0) {
                meta.oldestHistoricBlock = 1;
            }
            // std::cout << "New root " << uncommittedMeta.root << std::endl;
            BlockPayload block{ .size = meta.size, .blockNumber = meta.unfinalisedBlockHeight, .root = meta.root };
            dataStore_->write_block_data(meta.unfinalisedBlockHeight, block, *tx);
            dataStore_->write_block_index_data(block.blockNumber, block.size, *tx);

            meta.committedSize = meta.size;
            persist_meta(meta, *tx);
            tx->commit();
        } catch (std::exception& e) {
            tx->try_abort();
            throw std::runtime_error(
                format("Unable to commit data to tree: ", forkConstantData_.name_, " Error: ", e.what()));
        }
    }
    finalMeta = meta;

    // rolling back destroys all cache stores and also refreshes the cached meta_ from persisted state
    rollback();

    extract_db_stats(dbStats);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::extract_db_stats(TreeDBStats& stats)
{
    try {
        ReadTransactionPtr tx = create_read_transaction();
        extract_db_stats(stats, *tx);
    } catch (std::exception&) {
    }
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::extract_db_stats(TreeDBStats& stats, ReadTransaction& tx)
{
    try {
        dataStore_->get_stats(stats, tx);
    } catch (std::exception&) {
    }
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
            // this is a leaf, we need to persist the pre-image
            IndexedLeafValueType leafPreImage;
            if (cache_.get_leaf_preimage_by_hash(hash, leafPreImage)) {
                dataStore_->write_leaf_by_hash(hash, leafPreImage, tx);
            }
        }

        // std::cout << "Persisting node hash " << hash << " at level " << so.lvl << std::endl;
        NodePayload nodePayload;
        if (!cache_.get_node(hash, nodePayload)) {
            //  need to increase the stored node's reference count here
            dataStore_->increment_node_reference_count(hash, tx);
            continue;
        }

        dataStore_->set_or_increment_node_reference_count(hash, nodePayload, tx);
        if (nodePayload.ref != 1) {
            // If the node now has a ref count greater then 1, we don't continue.
            // It means that the entire sub-tree underneath already exists
            continue;
        }
        stack.push_back({ .opHash = nodePayload.left, .lvl = so.lvl + 1 });
        stack.push_back({ .opHash = nodePayload.right, .lvl = so.lvl + 1 });
    }
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::rollback()
{
    // Extract the committed meta data and destroy the cache
    cache_.reset(forkConstantData_.depth_);
    {
        ReadTransactionPtr tx = create_read_transaction();
        TreeMeta committedMeta;
        read_persisted_meta(committedMeta, *tx);
        cache_.put_meta(committedMeta);
    }
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
        ReadTransactionPtr readTx = create_read_transaction();
        get_meta(uncommittedMeta);
        get_meta(committedMeta, *readTx, false);
        if (!dataStore_->read_block_data(blockNumber, blockPayload, *readTx)) {
            throw std::runtime_error(format("Unable to advance finalised block: ",
                                            blockNumber,
                                            ". Failed to read block data. Tree name: ",
                                            forkConstantData_.name_));
        }
    }
    // do nothing if the block is already finalised
    if (committedMeta.finalisedBlockHeight >= blockNumber) {
        return;
    }

    // can currently only finalise up to the unfinalised block height
    if (committedMeta.finalisedBlockHeight > committedMeta.unfinalisedBlockHeight) {
        throw std::runtime_error(format("Unable to finalise block ",
                                        blockNumber,
                                        " currently unfinalised block height ",
                                        committedMeta.finalisedBlockHeight));
    }

    {
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
        ReadTransactionPtr readTx = create_read_transaction();
        get_meta(uncommittedMeta);
        get_meta(committedMeta, *readTx, false);
        if (committedMeta != uncommittedMeta) {
            throw std::runtime_error(
                format("Unable to unwind block: ",
                       blockNumber,
                       " Can't unwind with uncommitted data, first rollback before unwinding. Tree name: ",
                       forkConstantData_.name_));
        }
        if (blockNumber > uncommittedMeta.unfinalisedBlockHeight) {
            // Nothing to do, the block doesn't exist. Maybe it was already removed
            finalMeta = uncommittedMeta;
            extract_db_stats(dbStats, *readTx);
            return;
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
        } else if (!dataStore_->read_block_data(blockNumber - 1, previousBlockData, *readTx)) {
            throw std::runtime_error(format("Unable to unwind block: ",
                                            blockNumber,
                                            ". Failed to read previous block data. Tree name: ",
                                            forkConstantData_.name_));
        }

        // now get the root for the block we want to unwind
        if (!dataStore_->read_block_data(blockNumber, blockData, *readTx)) {
            throw std::runtime_error(format("Unable to unwind block: ",
                                            blockNumber,
                                            ". Failed to read block data. Tree name: ",
                                            forkConstantData_.name_));
        }
    }

    {
        WriteTransactionPtr writeTx = create_write_transaction();
        try {
            // std::cout << "Removing block " << blockNumber << std::endl;

            // If the tree was empty at the block being removed then we should not attempt to remove
            // any nodes. (there were no nodes at the point this block was comitted)
            if (blockData.size > 0) {
                // Remove the block's node and leaf data given the max index of the previous block
                std::optional<index_t> maxIndex = std::optional<index_t>(previousBlockData.size);
                remove_node(std::optional<fr>(blockData.root), 0, maxIndex, *writeTx);
            }
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
        ReadTransactionPtr readTx = create_read_transaction();
        get_meta(uncommittedMeta);
        get_meta(committedMeta, *readTx, false);
        if (blockNumber < committedMeta.oldestHistoricBlock) {
            // Nothing to do, the block was probably already removed
            finalMeta = uncommittedMeta;
            extract_db_stats(dbStats, *readTx);
            return;
        }
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
                                            " finalisedBlockHeight: ",
                                            committedMeta.finalisedBlockHeight,
                                            ". Tree name: ",
                                            forkConstantData_.name_));
        }

        if (!dataStore_->read_block_data(blockNumber, blockData, *readTx)) {
            throw std::runtime_error(format("Unable to remove historical block: ",
                                            blockNumber,
                                            ". Failed to read block data. Tree name: ",
                                            forkConstantData_.name_));
        }
    }
    {
        WriteTransactionPtr writeTx = create_write_transaction();
        try {
            // If the tree was empty at the block being removed then we should not attempt to remove
            // any nodes. (there were no nodes at the point this block was comitted)
            if (blockData.size > 0) {
                // remove the historical block's node data
                std::optional<index_t> maxIndex = std::nullopt;
                remove_node(std::optional<fr>(blockData.root), 0, maxIndex, *writeTx);
            }
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
        IndexedLeafValueType leaf_preimage;
        fr key;
        if constexpr (requires_preimage_for_key<LeafValueType>()) {
            // std::cout << "Reading leaf by hash " << hash << std::endl;
            if (!dataStore_->read_leaf_by_hash(hash, leaf_preimage, tx)) {
                throw std::runtime_error("Failed to find leaf pre-image when attempting to delete indices");
            }
            // std::cout << "Read leaf by hash " << hash << std::endl;
            key = preimage_to_key(leaf_preimage.leaf);
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
    TreeMeta meta;
    {
        ReadTransactionPtr tx = create_read_transaction();
        bool success = read_persisted_meta(meta, *tx);
        if (success) {
            if (forkConstantData_.name_ == meta.name && forkConstantData_.depth_ == meta.depth) {
                cache_.put_meta(meta);
                return;
            }
            throw std::runtime_error(
                format("Tree found to be uninitialised when attempting to create ", forkConstantData_.name_));
        }
    }

    // No meta data available. Write the initial state down
    meta.name = forkConstantData_.name_;
    meta.size = 0;
    meta.committedSize = 0;
    meta.root = fr::zero();
    meta.initialRoot = fr::zero();
    meta.depth = forkConstantData_.depth_;
    meta.initialSize = 0;
    meta.oldestHistoricBlock = 0;
    meta.unfinalisedBlockHeight = 0;
    meta.finalisedBlockHeight = 0;
    WriteTransactionPtr tx = create_write_transaction();
    try {
        persist_meta(meta, *tx);
        tx->commit();
    } catch (std::exception& e) {
        tx->try_abort();
        throw e;
    }
    cache_.put_meta(meta);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::initialise_from_block(const block_number_t& blockNumber)
{
    // Read the persisted meta data, if the name or depth of the tree is not consistent with what was provided during
    // construction then we throw
    {
        ReadTransactionPtr tx = create_read_transaction();
        TreeMeta meta;
        bool success = read_persisted_meta(meta, *tx);
        if (success) {
            if (forkConstantData_.name_ != meta.name || forkConstantData_.depth_ != meta.depth) {
                throw std::runtime_error(format("Inconsistent tree meta data when initialising ",
                                                forkConstantData_.name_,
                                                " with depth ",
                                                forkConstantData_.depth_,
                                                " from block ",
                                                blockNumber,
                                                " stored name: ",
                                                meta.name,
                                                "stored depth: ",
                                                meta.depth));
            }

        } else {
            throw std::runtime_error(format("Tree found to be uninitialised when attempting to create ",
                                            forkConstantData_.name_,
                                            " from block ",
                                            blockNumber));
        }

        if (meta.unfinalisedBlockHeight < blockNumber) {
            throw std::runtime_error(format("Unable to initialise from future block: ",
                                            blockNumber,
                                            " unfinalisedBlockHeight: ",
                                            meta.unfinalisedBlockHeight,
                                            ". Tree name: ",
                                            forkConstantData_.name_));
        }
        if (meta.oldestHistoricBlock > blockNumber && blockNumber != 0) {
            throw std::runtime_error(format("Unable to fork from expired historical block: ",
                                            blockNumber,
                                            " unfinalisedBlockHeight: ",
                                            meta.oldestHistoricBlock,
                                            ". Tree name: ",
                                            forkConstantData_.name_));
        }
        BlockPayload blockData;
        if (blockNumber == 0) {
            blockData.blockNumber = 0;
            blockData.root = meta.initialRoot;
            blockData.size = meta.initialSize;
        } else if (get_block_data(blockNumber, blockData, *tx) == false) {
            throw std::runtime_error(
                format("Failed to retrieve block data: ", blockNumber, ". Tree name: ", forkConstantData_.name_));
        }
        forkConstantData_.initialised_from_block_ = blockData;
        // Ensure the meta reflects the fork constant data
        enrich_meta_from_fork_constant_data(meta);
        cache_.put_meta(meta);
    }
}

} // namespace bb::crypto::merkle_tree
