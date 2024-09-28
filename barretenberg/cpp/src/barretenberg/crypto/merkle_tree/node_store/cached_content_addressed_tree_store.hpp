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

    std::optional<index_t> get_fork_block() const;

  private:
    std::string name_;
    uint32_t depth_;
    std::optional<BlockPayload> initialised_from_block_;

    // This is a mapping between the node hash and it's payload (children and ref count) for every node in the tree,
    // including leaves. As indexed trees are updated, this will end up containing many nodes that are not part of the
    // final tree so they need to be omitted from what is committed.
    std::unordered_map<fr, NodePayload> nodes_;

    // This is a store mapping the leaf key (e.g. slot for public data or nullifier value for nullifier tree) to the
    // indices in the tree For indexed tress there is only ever one index againt the key, for append-only trees there
    // can be multiple
    std::map<uint256_t, Indices> indices_;

    // This is a mapping from leaf hash to leaf pre-image. This will contai entries that need to be omitted when
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

    void persist_leaf(const fr& hash, WriteTransaction& tx);

    void persist_node(const std::optional<fr>& optional_hash, uint32_t level, WriteTransaction& tx);

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
    // Accessing indices under a lock
    std::unique_lock lock(mtx_);
    auto it = indices_.find(uint256_t(leaf.value.get_key()));
    if (it == indices_.end()) {
        Indices ind;
        ind.indices.push_back(index);
        indices_[uint256_t(leaf.value.get_key())] = ind;
        return;
    }
    it->second.indices.push_back(index);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::update_index(const index_t& index, const fr& leaf)
{
    // Accessing indices_ under a lock
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
            for (size_t i = 0; i < committed.indices.size(); ++i) {
                index_t ind = committed.indices[i];
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
            for (size_t i = 0; i < it->second.indices.size(); ++i) {
                index_t ind = it->second.indices[i];
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
    fr currentRoot = fr::zero();
    bool dataPresent = false;
    // We don't allow commits using images/forks
    if (initialised_from_block_.has_value()) {
        throw std::runtime_error("Committing an image is forbidden");
    }
    {
        ReadTransactionPtr tx = create_read_transaction();
        dataPresent = get_cached_node_by_index(0, 0, currentRoot);
        if (!dataPresent) {
            if (asBlock) {
                return;
            }
        } else {
            auto currentRootIter = nodes_.find(currentRoot);
            if (currentRootIter == nodes_.end()) {
                if (asBlock) {
                    return;
                }
            } else {
                hydrate_indices_from_persisted_store(*tx);
            }
        }
    }
    {
        WriteTransactionPtr tx = create_write_transaction();
        try {
            if (dataPresent) {
                persist_leaf_indices(*tx);
                persist_node(std::optional<fr>(currentRoot), 0, *tx);
                if (asBlock) {
                    ++meta_.unfinalisedBlockHeight;
                    BlockPayload block{ .size = meta_.size,
                                        .blockNumber = meta_.unfinalisedBlockHeight,
                                        .root = currentRoot };
                    dataStore_->write_block_data(meta_.unfinalisedBlockHeight, block, *tx);
                }
            }
            meta_.committedSize = meta_.size;
            persist_meta(meta_, *tx);
            tx->commit();
        } catch (std::exception& e) {
            tx->try_abort();
            throw;
        }
    }
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
void ContentAddressedCachedTreeStore<LeafValueType>::persist_leaf(const fr& hash, WriteTransaction& tx)
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
    if (!optional_hash.has_value()) {
        return;
    }
    fr hash = optional_hash.value();

    if (level == depth_) {
        // this is a leaf
        persist_leaf(hash, tx);
    }

    auto nodePayloadIter = nodes_.find(hash);
    if (nodePayloadIter == nodes_.end()) {
        //  need to reference count here
        return;
    }
    dataStore_->write_node(hash, nodePayloadIter->second, tx);
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
    meta_.finalisedBlockHeight = 0;
    meta_.unfinalisedBlockHeight = 0;
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
        BlockPayload blockData;
        if (blockNumber == 0) {
            blockData.blockNumber = 0;
            blockData.root = meta_.root;
            blockData.size = meta_.size;
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
