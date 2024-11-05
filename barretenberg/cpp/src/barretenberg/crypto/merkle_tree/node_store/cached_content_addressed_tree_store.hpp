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
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <unordered_map>
#include <utility>

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

template <typename LeafType> fr preimage_to_key(const LeafType& leaf)
{
    return leaf.get_key();
}

inline fr preimage_to_key(const fr& leaf)
{
    return leaf;
}

template <typename LeafType> bool requires_preimage_for_key()
{
    return true;
}

template <> inline bool requires_preimage_for_key<fr>()
{
    return false;
}

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
    void put_cached_node_by_index(uint32_t level, index_t index, const fr& data, bool overwriteIfPresent = true);

    /**
     * @brief Returns the data at the given node coordinates if available.
     */
    bool get_cached_node_by_index(uint32_t level, index_t index, fr& data) const;

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
    bool get_block_data(const index_t& blockNumber, BlockPayload& blockData, ReadTransaction& tx) const;

    /**
     * @brief Finds the index of the given leaf value in the tree if available. Includes uncommitted data if requested.
     */
    std::optional<index_t> find_leaf_index(const LeafValueType& leaf,
                                           const RequestContext& requestContext,
                                           ReadTransaction& tx,
                                           bool includeUncommitted) const;

    /**
     * @brief Finds the index of the given leaf value in the tree if available. Includes uncommitted data if requested.
     */
    std::optional<index_t> find_leaf_index_from(const LeafValueType& leaf,
                                                index_t start_index,
                                                const RequestContext& requestContext,
                                                ReadTransaction& tx,
                                                bool includeUncommitted) const;

    /**
     * @brief Commits the uncommitted data to the underlying store
     */
    void commit(bool asBlock = true);

    /**
     * @brief Rolls back the uncommitted state
     */
    void rollback();

    /**
     * @brief Returns the name of the tree
     */
    std::string get_name() const { return name_; }

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

    void remove_historical_block(const index_t& blockNumber);

    void unwind_block(const index_t& blockNumber);

    std::optional<index_t> get_fork_block() const;

    void advance_finalised_block(index_t blockNumber);

  private:
    std::string name_;
    uint32_t depth_;
    std::optional<BlockPayload> initialised_from_block_;

    // This is a mapping between the node hash and it's payload (children and ref count) for every node in the tree,
    // including leaves. As indexed trees are updated, this will end up containing many nodes that are not part of the
    // final tree so they need to be omitted from what is committed.
    std::unordered_map<fr, NodePayload> nodes_;

    // This is a store mapping the leaf key (e.g. slot for public data or nullifier value for nullifier tree) to the
    // indices in the tree For indexed tress there is only ever one index against the key, for append-only trees there
    // can be multiple
    std::map<uint256_t, Indices> indices_;

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

    void initialise_from_block(const index_t& blockNumber);

    bool read_persisted_meta(TreeMeta& m, ReadTransaction& tx) const;

    void enrich_meta_from_block(TreeMeta& m) const;

    void persist_meta(TreeMeta& m, WriteTransaction& tx);

    void hydrate_indices_from_persisted_store(ReadTransaction& tx);

    void persist_leaf_indices(WriteTransaction& tx);

    void persist_leaf_keys(index_t startIndex, WriteTransaction& tx);

    void persist_leaf_pre_image(const fr& hash, WriteTransaction& tx);

    void persist_node(const std::optional<fr>& optional_hash, uint32_t level, WriteTransaction& tx);

    void remove_node(const std::optional<fr>& optional_hash,
                     uint32_t level,
                     std::optional<index_t> maxIndex,
                     WriteTransaction& tx);

    void remove_leaf(const fr& hash, std::optional<index_t> maxIndex, WriteTransaction& tx);

    void remove_leaf_indices(const fr& key, const index_t& maxIndex, WriteTransaction& tx);

    void remove_leaf_indices_after_or_equal_index(const index_t& maxIndex, WriteTransaction& tx);

    index_t constrain_tree_size(const RequestContext& requestContext, ReadTransaction& tx) const;

    WriteTransactionPtr create_write_transaction() const { return dataStore_->create_write_transaction(); }
};

template <typename LeafValueType>
ContentAddressedCachedTreeStore<LeafValueType>::ContentAddressedCachedTreeStore(std::string name,
                                                                                uint32_t levels,
                                                                                PersistedStoreType::SharedPtr dataStore)
    : name_(std::move(name))
    , depth_(levels)
    , dataStore_(dataStore)
    , nodes_by_index_(std::vector<std::unordered_map<index_t, fr>>(depth_ + 1, std::unordered_map<index_t, fr>()))
{
    initialise();
}

template <typename LeafValueType>
ContentAddressedCachedTreeStore<LeafValueType>::ContentAddressedCachedTreeStore(std::string name,
                                                                                uint32_t levels,
                                                                                const index_t& referenceBlockNumber,
                                                                                PersistedStoreType::SharedPtr dataStore)
    : name_(std::move(name))
    , depth_(levels)
    , dataStore_(dataStore)
    , nodes_by_index_(std::vector<std::unordered_map<index_t, fr>>(depth_ + 1, std::unordered_map<index_t, fr>()))
{
    initialise_from_block(referenceBlockNumber);
}

template <typename LeafValueType>
index_t ContentAddressedCachedTreeStore<LeafValueType>::constrain_tree_size(const RequestContext& requestContext,
                                                                            ReadTransaction& tx) const
{
    TreeMeta m;
    get_meta(m, tx, true);
    index_t sizeLimit = m.committedSize;
    if (requestContext.blockNumber.has_value()) {
        BlockPayload blockData;
        if (dataStore_->read_block_data(requestContext.blockNumber.value(), blockData, tx)) {
            sizeLimit = std::min(meta_.committedSize, blockData.size);
        }
    }
    return sizeLimit;
}

template <typename LeafValueType>
std::pair<bool, index_t> ContentAddressedCachedTreeStore<LeafValueType>::find_low_value(
    const fr& new_leaf_key, const RequestContext& requestContext, ReadTransaction& tx) const
{
    auto new_value_as_number = uint256_t(new_leaf_key);
    Indices committed;
    std::optional<index_t> sizeLimit = std::nullopt;
    if (initialised_from_block_.has_value() || requestContext.blockNumber.has_value()) {
        sizeLimit = constrain_tree_size(requestContext, tx);
    }

    fr found_key = dataStore_->find_low_leaf(new_leaf_key, committed, sizeLimit, tx);
    auto db_index = committed.indices[0];
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

        return std::make_pair(false, it->first > retrieved_value ? it->second.indices[0] : db_index);
    }

    if (it->first == uint256_t(new_value_as_number)) {
        // the value is already present and the iterator points to it
        return std::make_pair(true, it->second.indices[0]);
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
    return std::make_pair(false, it->first > retrieved_value ? it->second.indices[0] : db_index);
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
    auto it = indices_.find(uint256_t(leaf));
    if (it == indices_.end()) {
        Indices ind;
        ind.indices.push_back(index);
        indices_[uint256_t(leaf)] = ind;
        return;
    }
    it->second.indices.push_back(index);
}

template <typename LeafValueType>
std::optional<index_t> ContentAddressedCachedTreeStore<LeafValueType>::find_leaf_index(
    const LeafValueType& leaf, const RequestContext& requestContext, ReadTransaction& tx, bool includeUncommitted) const
{
    return find_leaf_index_from(leaf, 0, requestContext, tx, includeUncommitted);
}

template <typename LeafValueType>
std::optional<index_t> ContentAddressedCachedTreeStore<LeafValueType>::find_leaf_index_from(
    const LeafValueType& leaf,
    index_t start_index,
    const RequestContext& requestContext,
    ReadTransaction& tx,
    bool includeUncommitted) const
{
    Indices committed;
    std::optional<index_t> result = std::nullopt;
    FrKeyType key = leaf;
    std::vector<uint8_t> value;
    bool success = dataStore_->read_leaf_indices(key, committed, tx);
    if (success) {
        index_t sizeLimit = constrain_tree_size(requestContext, tx);
        if (!committed.indices.empty()) {
            for (index_t ind : committed.indices) {
                if (ind < start_index) {
                    continue;
                }
                if (ind >= sizeLimit) {
                    continue;
                }
                if (!result.has_value()) {
                    result = ind;
                    continue;
                }
                result = std::min(ind, result.value());
            }
        }
    }
    if (includeUncommitted) {
        // Accessing indices_ under a lock
        std::unique_lock lock(mtx_);
        auto it = indices_.find(uint256_t(leaf));
        if (it != indices_.end() && !it->second.indices.empty()) {
            for (index_t ind : it->second.indices) {
                if (ind < start_index) {
                    continue;
                }
                if (!result.has_value()) {
                    result = ind;
                    continue;
                }
                result = std::min(ind, result.value());
            }
        }
    }
    return result;
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
                                                                              index_t index,
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
                                                                              index_t index,
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
bool ContentAddressedCachedTreeStore<LeafValueType>::get_block_data(const index_t& blockNumber,
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
    enrich_meta_from_block(m);
    return true;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::enrich_meta_from_block(TreeMeta& m) const
{
    if (initialised_from_block_.has_value()) {
        m.size = initialised_from_block_->size;
        m.committedSize = initialised_from_block_->size;
        m.root = initialised_from_block_->root;
        m.unfinalisedBlockHeight = initialised_from_block_->blockNumber;
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

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::commit(bool asBlock)
{
    bool dataPresent = false;
    TreeMeta uncommittedMeta;
    TreeMeta committedMeta;
    // We don't allow commits using images/forks
    if (initialised_from_block_.has_value()) {
        throw std::runtime_error("Committing a fork is forbidden");
    }
    {
        ReadTransactionPtr tx = create_read_transaction();
        // read both committed and uncommitted meta data
        get_meta(uncommittedMeta, *tx, true);
        get_meta(committedMeta, *tx, false);

        // if the meta datas are different, we have uncommitted data
        bool metaToCommit = committedMeta != uncommittedMeta;
        if (!metaToCommit) {
            return;
        }
        auto currentRootIter = nodes_.find(uncommittedMeta.root);
        dataPresent = currentRootIter != nodes_.end();
        if (!dataPresent) {
            // no uncommitted data present, if we were asked to commit as a block then we can't
            if (asBlock) {
                throw std::runtime_error("Can't commit as block if no data present");
            }
        } else {
            // data is present, hydrate persisted indices
            hydrate_indices_from_persisted_store(*tx);
        }
    }
    {
        WriteTransactionPtr tx = create_write_transaction();
        try {
            if (dataPresent) {
                // std::cout << "Persisting data for block " << uncommittedMeta.unfinalisedBlockHeight + 1 << std::endl;
                persist_leaf_indices(*tx);
                persist_leaf_keys(uncommittedMeta.committedSize, *tx);
                persist_node(std::optional<fr>(uncommittedMeta.root), 0, *tx);
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
                }
            }
            uncommittedMeta.committedSize = uncommittedMeta.size;
            persist_meta(uncommittedMeta, *tx);
            tx->commit();
        } catch (std::exception& e) {
            tx->try_abort();
            throw;
        }
    }

    // rolling back destroys all cache stores and also refreshes the cached meta_ from persisted state
    rollback();
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_leaf_indices(WriteTransaction& tx)
{
    for (auto& idx : indices_) {
        FrKeyType key = idx.first;
        dataStore_->write_leaf_indices(key, idx.second, tx);
    }
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_leaf_keys(index_t startIndex, WriteTransaction& tx)
{
    for (auto& idx : indices_) {
        FrKeyType key = idx.first;

        // write the leaf key against the indices, this is for the pending chain store of indices
        for (index_t indexForKey : idx.second.indices) {
            if (indexForKey < startIndex) {
                continue;
            }
            dataStore_->write_leaf_key_by_index(key, indexForKey, tx);
        }
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
    // std::cout << "Persisting leaf preimage " << leafPreImageIter->second << std::endl;
    dataStore_->write_leaf_by_hash(hash, leafPreImageIter->second, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_node(const std::optional<fr>& optional_hash,
                                                                  uint32_t level,
                                                                  WriteTransaction& tx)
{
    // If the optional hash does not have a value then it means it's the zero tree value at this level
    // If it has a value but that value is not in our stores then it means it is referencing a node
    // created in a previous block, so that will need to have it's reference count increased
    if (!optional_hash.has_value()) {
        return;
    }
    fr hash = optional_hash.value();

    if (level == depth_) {
        // this is a leaf
        persist_leaf_pre_image(hash, tx);
    }

    // std::cout << "Persisting node hash " << hash << " at level " << level << std::endl;

    auto nodePayloadIter = nodes_.find(hash);
    if (nodePayloadIter == nodes_.end()) {
        //  need to increase the stored node's reference count here
        dataStore_->increment_node_reference_count(hash, tx);
        return;
    }
    NodePayload nodeData = nodePayloadIter->second;
    dataStore_->set_or_increment_node_reference_count(hash, nodeData, tx);
    if (nodeData.ref != 1) {
        // If the node now has a ref count greater then 1, we don't continue.
        // It means that the entire sub-tree underneath already exists
        return;
    }
    persist_node(nodePayloadIter->second.left, level + 1, tx);
    persist_node(nodePayloadIter->second.right, level + 1, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::hydrate_indices_from_persisted_store(ReadTransaction& tx)
{
    for (auto& idx : indices_) {
        std::vector<uint8_t> value;
        FrKeyType key = idx.first;
        Indices persistedIndices;
        bool success = dataStore_->read_leaf_indices(key, persistedIndices, tx);
        if (success) {
            idx.second.indices.insert(
                idx.second.indices.begin(), persistedIndices.indices.begin(), persistedIndices.indices.end());
        }
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
    indices_ = std::map<uint256_t, Indices>();
    leaves_ = std::unordered_map<fr, IndexedLeafValueType>();
    nodes_by_index_ = std::vector<std::unordered_map<index_t, fr>>(depth_ + 1, std::unordered_map<index_t, fr>());
    leaf_pre_image_by_index_ = std::unordered_map<index_t, IndexedLeafValueType>();
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_meta(TreeMeta& m, WriteTransaction& tx)
{
    dataStore_->write_meta_data(m, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::advance_finalised_block(index_t blockNumber)
{
    TreeMeta committedMeta;
    TreeMeta uncommittedMeta;
    BlockPayload blockPayload;
    if (blockNumber < 1) {
        throw std::runtime_error("Unable to remove block");
    }
    if (initialised_from_block_.has_value()) {
        throw std::runtime_error("Advancing the finalised block on a fork is forbidden");
    }
    {
        // read both committed and uncommitted meta values
        ReadTransactionPtr tx = create_read_transaction();
        get_meta(uncommittedMeta, *tx, true);
        get_meta(committedMeta, *tx, false);
        if (!dataStore_->read_block_data(blockNumber, blockPayload, *tx)) {
            throw std::runtime_error("Failed to retrieve block data");
        }
    }
    // can only finalise blocks that are not finalised
    if (committedMeta.finalisedBlockHeight >= blockNumber) {
        std::stringstream ss;
        ss << "Unable to finalise block " << blockNumber << " currently finalised block height "
           << committedMeta.finalisedBlockHeight << std::endl;
        throw std::runtime_error(ss.str());
    }

    // can currently only finalise up to the unfinalised block height
    if (committedMeta.finalisedBlockHeight > committedMeta.unfinalisedBlockHeight) {
        std::stringstream ss;
        ss << "Unable to finalise block " << blockNumber << " currently unfinalised block height "
           << committedMeta.unfinalisedBlockHeight << std::endl;
        throw std::runtime_error(ss.str());
    }

    // commit the new finalised block
    WriteTransactionPtr writeTx = create_write_transaction();
    try {
        // determine where we need to prune the leaf keys store up to
        index_t highestIndexToRemove = blockPayload.size - 1;
        committedMeta.finalisedBlockHeight = blockNumber;
        // clean up the leaf keys index table
        dataStore_->delete_all_leaf_keys_before_or_equal_index(highestIndexToRemove, *writeTx);
        // persist the new meta data
        persist_meta(committedMeta, *writeTx);
        writeTx->commit();
    } catch (std::exception& e) {
        writeTx->try_abort();
        throw;
    }

    // commit successful, now also update the uncommitted meta
    uncommittedMeta.finalisedBlockHeight = committedMeta.finalisedBlockHeight;
    put_meta(uncommittedMeta);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::unwind_block(const index_t& blockNumber)
{
    TreeMeta uncommittedMeta;
    TreeMeta committedMeta;
    BlockPayload blockData;
    BlockPayload previousBlockData;
    if (blockNumber < 1) {
        throw std::runtime_error("Unable to remove block");
    }
    if (initialised_from_block_.has_value()) {
        throw std::runtime_error("Removing a block on a fork is forbidden");
    }
    {
        ReadTransactionPtr tx = create_read_transaction();
        get_meta(uncommittedMeta, *tx, true);
        get_meta(committedMeta, *tx, false);
        if (committedMeta != uncommittedMeta) {
            throw std::runtime_error("Can't unwind with uncommitted data, first rollback before unwinding");
        }
        if (blockNumber != uncommittedMeta.unfinalisedBlockHeight) {
            throw std::runtime_error("Block number is not the most recent");
        }
        if (blockNumber <= uncommittedMeta.finalisedBlockHeight) {
            throw std::runtime_error("Can't unwind a finalised block");
        }

        // populate the required data for the previous block
        if (blockNumber == 1) {
            previousBlockData.root = uncommittedMeta.initialRoot;
            previousBlockData.size = uncommittedMeta.initialSize;
            previousBlockData.blockNumber = 0;
        } else if (!dataStore_->read_block_data(blockNumber - 1, previousBlockData, *tx)) {
            throw std::runtime_error("Failed to retrieve previous block data");
        }

        // now get the root for the block we want to unwind
        if (!dataStore_->read_block_data(blockNumber, blockData, *tx)) {
            throw std::runtime_error("Failed to retrieve block data for block to unwind");
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
        remove_leaf_indices_after_or_equal_index(previousBlockData.size, *writeTx);
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
        throw;
    }

    // now update the uncommitted meta
    put_meta(uncommittedMeta);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::remove_historical_block(const index_t& blockNumber)
{
    TreeMeta committedMeta;
    TreeMeta uncommittedMeta;
    BlockPayload blockData;
    if (blockNumber < 1) {
        throw std::runtime_error("Unable to remove block");
    }
    if (initialised_from_block_.has_value()) {
        throw std::runtime_error("Removing a block on a fork is forbidden");
    }
    {
        // retrieve both the committed and uncommitted meta data, validate the provide block is the oldest historical
        // block
        ReadTransactionPtr tx = create_read_transaction();
        get_meta(uncommittedMeta, *tx, true);
        get_meta(committedMeta, *tx, false);
        if (blockNumber != committedMeta.oldestHistoricBlock) {
            throw std::runtime_error("Block number is not the most historic");
        }
        if (blockNumber >= committedMeta.finalisedBlockHeight) {
            throw std::runtime_error("Can't remove current finalised block");
        }

        if (!dataStore_->read_block_data(blockNumber, blockData, *tx)) {
            throw std::runtime_error("Failed to retrieve block data for historical block");
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
        throw;
    }

    // commit was successful, update the uncommitted meta
    uncommittedMeta.oldestHistoricBlock = committedMeta.oldestHistoricBlock;
    put_meta(uncommittedMeta);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::remove_leaf_indices_after_or_equal_index(const index_t& index,
                                                                                              WriteTransaction& tx)
{
    std::vector<bb::fr> leafKeys;
    dataStore_->read_all_leaf_keys_after_or_equal_index(index, leafKeys, tx);
    for (const fr& key : leafKeys) {
        remove_leaf_indices(key, index, tx);
    }
    dataStore_->delete_all_leaf_keys_after_or_equal_index(index, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::remove_leaf_indices(const fr& key,
                                                                         const index_t& maxIndex,
                                                                         WriteTransaction& tx)
{
    // We now have the key, extract the indices
    Indices indices;
    // std::cout << "Reading indices for key " << key << std::endl;
    dataStore_->read_leaf_indices(key, indices, tx);
    // std::cout << "Indices length before removal " << indices.indices.size() << std::endl;

    size_t lengthBefore = indices.indices.size();

    indices.indices.erase(
        std::remove_if(indices.indices.begin(), indices.indices.end(), [&](index_t& ind) { return ind >= maxIndex; }),
        indices.indices.end());

    size_t lengthAfter = indices.indices.size();
    // std::cout << "Indices length after removal " << indices.indices.size() << std::endl;

    if (lengthBefore != lengthAfter) {
        if (indices.indices.empty()) {
            // std::cout << "Deleting indices" << std::endl;
            dataStore_->delete_leaf_indices(key, tx);
        } else {
            // std::cout << "Writing indices" << std::endl;
            dataStore_->write_leaf_indices(key, indices, tx);
        }
    }
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::remove_leaf(const fr& hash,
                                                                 std::optional<index_t> maxIndex,
                                                                 WriteTransaction& tx)
{
    // std::cout << "Removing leaf " << hash << std::endl;
    if (maxIndex.has_value()) {
        // std::cout << "Max Index" << std::endl;
        //   We need to clear the entry from the leaf key to indices database as this leaf never existed
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
        remove_leaf_indices(key, maxIndex.value(), tx);
    }
    // std::cout << "Deleting leaf by hash " << std::endl;
    dataStore_->delete_leaf_by_hash(hash, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::remove_node(const std::optional<fr>& optional_hash,
                                                                 uint32_t level,
                                                                 std::optional<index_t> maxIndex,
                                                                 WriteTransaction& tx)
{
    if (!optional_hash.has_value()) {
        return;
    }
    fr hash = optional_hash.value();

    // we need to retrieve the node and decrement it's reference count
    // std::cout << "Decrementing ref count for node " << hash << ", level " << level << std::endl;
    NodePayload nodeData;
    dataStore_->decrement_node_reference_count(hash, nodeData, tx);

    if (nodeData.ref != 0) {
        // node was not deleted, we don't continue the search
        return;
    }

    // the node was deleted, if it was a leaf then we need to remove the pre-image
    if (level == depth_) {
        remove_leaf(hash, maxIndex, tx);
    }

    // now recursively remove the next level
    remove_node(std::optional<fr>(nodeData.left), level + 1, maxIndex, tx);
    remove_node(std::optional<fr>(nodeData.right), level + 1, maxIndex, tx);
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
            if (name_ == meta_.name && depth_ == meta_.depth) {
                return;
            }
            throw std::runtime_error("Invalid tree meta data");
        }
    }

    // No meta data available. Write the initial state down
    meta_.name = name_;
    meta_.size = 0;
    meta_.committedSize = 0;
    meta_.root = fr::zero();
    meta_.initialRoot = fr::zero();
    meta_.depth = depth_;
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
void ContentAddressedCachedTreeStore<LeafValueType>::initialise_from_block(const index_t& blockNumber)
{
    // Read the persisted meta data, if the name or depth of the tree is not consistent with what was provided during
    // construction then we throw
    std::vector<uint8_t> data;
    {
        ReadTransactionPtr tx = create_read_transaction();
        bool success = read_persisted_meta(meta_, *tx);
        if (success) {
            if (name_ != meta_.name || depth_ != meta_.depth) {
                throw std::runtime_error("Invalid tree meta data");
            }

        } else {
            throw std::runtime_error("Tree must be initialised");
        }

        if (meta_.unfinalisedBlockHeight < blockNumber) {
            throw std::runtime_error("Unable to initialise from future block");
        }
        if (meta_.oldestHistoricBlock > blockNumber && blockNumber != 0) {
            throw std::runtime_error("Unable to fork from expired historical block");
        }
        BlockPayload blockData;
        if (blockNumber == 0) {
            blockData.blockNumber = 0;
            blockData.root = meta_.initialRoot;
            blockData.size = meta_.initialSize;
        } else if (get_block_data(blockNumber, blockData, *tx) == false) {
            throw std::runtime_error(
                (std::stringstream() << "Failed to retrieve block data: " << blockNumber << ". Tree name: " << name_)
                    .str());
        }
        initialised_from_block_ = blockData;
        enrich_meta_from_block(meta_);
    }
}

template <typename LeafValueType>
std::optional<index_t> ContentAddressedCachedTreeStore<LeafValueType>::get_fork_block() const
{
    if (initialised_from_block_.has_value()) {
        return initialised_from_block_->blockNumber;
    }
    return std::nullopt;
}

} // namespace bb::crypto::merkle_tree
