#pragma once
#include "./tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "msgpack/assert.hpp"
#include <cstdint>
#include <exception>
#include <memory>
#include <optional>
#include <unordered_map>
#include <utility>

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

    ContentAddressedCachedTreeStore(std::string name, uint32_t levels, PersistedStoreType& dataStore)
        : name(std::move(name))
        , depth(levels)
        , dataStore(dataStore)
    {
        initialise();
    }
    ~ContentAddressedCachedTreeStore() = default;

    ContentAddressedCachedTreeStore() = delete;
    ContentAddressedCachedTreeStore(ContentAddressedCachedTreeStore const& other) = delete;
    ContentAddressedCachedTreeStore(ContentAddressedCachedTreeStore const&& other) = delete;
    ContentAddressedCachedTreeStore& operator=(ContentAddressedCachedTreeStore const& other) = delete;
    ContentAddressedCachedTreeStore& operator=(ContentAddressedCachedTreeStore const&& other) = delete;

    /**
     * @brief Returns the index of the leaf with a value immediately lower than the value provided
     */
    std::pair<bool, index_t> find_low_value(const fr& new_leaf_key, bool includeUncommitted, ReadTransaction& tx) const;

    /**
     * @brief Returns the leaf at the provided index, if one exists
     */
    std::optional<IndexedLeafValueType> get_leaf(const index_t& index,
                                                 ReadTransaction& tx,
                                                 bool includeUncommitted) const;

    /**
     * @brief Adds the leaf at the given index, updates the leaf index if requested
     */
    void set_at_index(const index_t& index, const IndexedLeafValueType& leaf, bool add_to_index);

    /**
     * @brief Updates the leaf index
     */
    void update_index(const index_t& index, const fr& leaf);

    /**
     * @brief Writes the provided data at the given node coordinates. Only writes to uncommitted data.
     */
    void put_node(const fr& nodeHash, const NodePayload& payload);

    /**
     * @brief Returns the data at the given node coordinates if available. Reads from uncommitted state if requested.
     */
    bool get_node(const fr& nodeHash,
                  NodePayload& payload,
                  ReadTransaction& transaction,
                  bool includeUncommitted) const;

    /**
     * @brief Writes the provided meta data to uncommitted state
     */
    void put_meta(const TreeMeta& m);

    /**
     * @brief Writes the provided initial meta data to uncommitted state
     */
    // void put_initial_meta(const index_t& size, const bb::fr& root);

    /**
     * @brief Reads the tree meta data, including uncommitted data if requested
     */
    void get_meta(TreeMeta& m, ReadTransaction& tx, bool includeUncommitted) const;

    /**
     * @brief Reads the tree meta data, including uncommitted data if requested
     */
    // void get_initial_meta(index_t& size, bb::fr& root, ReadTransaction& tx) const;

    /**
     * @brief Reads the extended tree meta data, including uncommitted data if requested
     */
    // void get_full_meta(index_t& size,
    //                    bb::fr& root,
    //                    std::string& name,
    //                    uint32_t& depth,
    //                    ReadTransaction& tx,
    //                    bool includeUncommitted) const;

    /**
     * @brief Finds the index of the given leaf value in the tree if available. Includes uncommitted data if requested.
     */
    std::optional<index_t> find_leaf_index(const LeafValueType& leaf,
                                           ReadTransaction& tx,
                                           bool includeUncommitted) const;

    /**
     * @brief Finds the index of the given leaf value in the tree if available. Includes uncommitted data if requested.
     */
    std::optional<index_t> find_leaf_index_from(const LeafValueType& leaf,
                                                index_t start_index,
                                                ReadTransaction& tx,
                                                bool includeUncommitted) const;

    /**
     * @brief Commits the uncommitted data to the underlying store
     */
    void commit();

    /**
     * @brief Rolls back the uncommitted state
     */
    void rollback();

    /**
     * @brief Returns the name of the tree
     */
    std::string get_name() const { return name; }

    /**
     * @brief Returns a read transaction against the underlying store.
     */
    ReadTransactionPtr create_read_transaction() const { return dataStore.create_read_transaction(); }

  private:
    std::string name;
    uint32_t depth;
    // std::vector<std::unordered_map<index_t, std::vector<uint8_t>>> nodes;
    std::map<fr, NodePayload> nodes;
    std::map<uint256_t, Indices> indices;
    std::map<fr, IndexedLeafValueType> leaves;
    PersistedStoreType& dataStore;
    TreeMeta meta;

    void initialise();

    bool read_persisted_meta(TreeMeta& m, ReadTransaction& tx) const;

    void persist_meta(TreeMeta& m, WriteTransaction& tx);

    WriteTransactionPtr create_write_transaction() const { return dataStore.create_write_transaction(); }
};

template <typename LeafValueType>
std::pair<bool, index_t> ContentAddressedCachedTreeStore<LeafValueType>::find_low_value(const fr& new_leaf_key,
                                                                                        bool includeUncommitted,
                                                                                        ReadTransaction& tx) const
{
    uint256_t new_value_as_number = uint256_t(new_leaf_key);
    Indices committed;
    fr found_key = dataStore.find_low_leaf(new_leaf_key, committed, tx);
    auto db_index = committed.indices[0];
    uint256_t retrieved_value = found_key;
    if (!includeUncommitted || retrieved_value == new_value_as_number || indices.empty()) {
        return std::make_pair(new_value_as_number == retrieved_value, db_index);
    }

    // At this stage, we have been asked to include uncommitted and the value was not exactly found in the db
    auto it = indices.lower_bound(new_value_as_number);
    if (it == indices.end()) {
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
    if (it == indices.begin()) {
        // No cached lower value, return the db index
        return std::make_pair(false, db_index);
    }
    --it;
    //  it now points to the value less than that requested
    return std::make_pair(false, it->first > retrieved_value ? it->second.indices[0] : db_index);
}

// template <typename LeafValueType>
// std::optional<typename ContentAddressedCachedTreeStore<LeafValueType>::IndexedLeafValueType>
// ContentAddressedCachedTreeStore<LeafValueType>::get_leaf(
//     const index_t& index, ReadTransaction& tx, bool includeUncommitted) const
// {
//     if (includeUncommitted) {
//         typename std::unordered_map<index_t, IndexedLeafValueType>::const_iterator it = leaves.find(index);
//         if (it != leaves.end()) {
//             return it->second;
//         }
//     }
//     fr leafHash;
//     bool success = dataStore.read_leaf_hash(index, leafHash, tx);
//     if (success) {
//         IndexedLeafValueType leafData;
//         success = dataStore.read_leaf(leafHash, leafData, tx);
//         if (success) {
//             return leafData;
//         }
//     }
//     return std::nullopt;
// }

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::set_at_index(const index_t& index,
                                                                  const IndexedLeafValueType& leaf,
                                                                  bool add_to_index)
{
    leaves[index] = leaf;
    if (add_to_index) {
        auto it = indices.find(uint256_t(leaf.value.get_key()));
        if (it == indices.end()) {
            Indices ind;
            ind.indices.push_back(index);
            indices[uint256_t(leaf.value.get_key())] = ind;
            return;
        }
        it->second.indices.push_back(index);
    }
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::update_index(const index_t& index, const fr& leaf)
{
    auto it = indices.find(uint256_t(leaf));
    if (it == indices.end()) {
        Indices ind;
        ind.indices.push_back(index);
        indices[uint256_t(leaf)] = ind;
        return;
    }
    it->second.indices.push_back(index);
}

template <typename LeafValueType>
std::optional<index_t> ContentAddressedCachedTreeStore<LeafValueType>::find_leaf_index(const LeafValueType& leaf,
                                                                                       ReadTransaction& tx,
                                                                                       bool includeUncommitted) const
{
    return find_leaf_index_from(leaf, 0, tx, includeUncommitted);
}

template <typename LeafValueType>
std::optional<index_t> ContentAddressedCachedTreeStore<LeafValueType>::find_leaf_index_from(
    const LeafValueType& leaf, index_t start_index, ReadTransaction& tx, bool includeUncommitted) const
{
    Indices committed;
    std::optional<index_t> result = std::nullopt;
    FrKeyType key = leaf;
    std::vector<uint8_t> value;
    bool success = dataStore.read_leaf_indices(key, committed, tx);
    if (success) {
        if (!committed.indices.empty()) {
            for (size_t i = 0; i < committed.indices.size(); ++i) {
                index_t ind = committed.indices[i];
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
    if (includeUncommitted) {
        auto it = indices.find(uint256_t(leaf));
        if (it != indices.end() && !it->second.indices.empty()) {
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
void ContentAddressedCachedTreeStore<LeafValueType>::put_node(const fr& nodeHash, const NodePayload& payload)
{
    nodes[nodeHash] = payload;
}

template <typename LeafValueType>
bool ContentAddressedCachedTreeStore<LeafValueType>::get_node(const fr& nodeHash,
                                                              NodePayload& payload,
                                                              ReadTransaction& transaction,
                                                              bool includeUncommitted) const
{
    if (includeUncommitted) {
        auto it = nodes.find(nodeHash);
        if (it != nodes.end()) {
            payload = it->second;
            return true;
        }
    }
    return dataStore.read_node(nodeHash, payload, transaction);
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::put_meta(const TreeMeta& m)
{
    meta = m;
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::get_meta(TreeMeta& m,
                                                              ReadTransaction& tx,
                                                              bool includeUncommitted) const
{
    if (includeUncommitted) {
        m = meta;
        return;
    }
    read_persisted_meta(m, tx);
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::commit()
{
    {
        {
            std::cout << "1" << std::endl;
            ReadTransactionPtr tx = create_read_transaction();
            for (auto& idx : indices) {
                std::vector<uint8_t> value;
                FrKeyType key = idx.first;
                Indices persistedIndices;
                bool success = dataStore.read_leaf_indices(key, persistedIndices, *tx);
                if (success) {
                    idx.second.indices.insert(
                        idx.second.indices.begin(), persistedIndices.indices.begin(), persistedIndices.indices.end());
                }
            }
            std::cout << "2" << std::endl;
        }
        WriteTransactionPtr tx = create_write_transaction();
        try {
            std::cout << "3" << std::endl;
            for (auto& item : nodes) {
                FrKeyType key = item.first;
                dataStore.write_node(key, item.second, *tx);
            }
            std::cout << "4" << std::endl;
            for (auto& idx : indices) {
                FrKeyType key = idx.first;
                std::cout << "Second length " << idx.second.indices.size() << std::endl;
                dataStore.write_leaf_indices(key, idx.second, *tx);
            }
            std::cout << "5" << std::endl;
            for (const auto& leaf : leaves) {
                FrKeyType key = leaf.first;
                dataStore.write_leaf(key, leaf.second, *tx);
            }
            std::cout << "6" << std::endl;
            persist_meta(meta, *tx);
            tx->commit();
            std::cout << "7" << std::endl;
        } catch (std::exception& e) {
            tx->try_abort();
            throw;
        }
    }
    rollback();
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::rollback()
{
    // Extract the committed meta data and destroy the cache
    {
        ReadTransactionPtr tx = create_read_transaction();
        read_persisted_meta(meta, *tx);
    }
    nodes = std::map<fr, NodePayload>();
    indices = std::map<uint256_t, Indices>();
    leaves = std::map<fr, IndexedLeafValueType>();
}

template <typename LeafValueType>
bool ContentAddressedCachedTreeStore<LeafValueType>::read_persisted_meta(TreeMeta& m, ReadTransaction& tx) const
{
    return dataStore.read_meta_data(m, tx);
}

template <typename LeafValueType>
void ContentAddressedCachedTreeStore<LeafValueType>::persist_meta(TreeMeta& m, WriteTransaction& tx)
{
    dataStore.write_meta_data(m, tx);
}

template <typename LeafValueType> void ContentAddressedCachedTreeStore<LeafValueType>::initialise()
{
    // Read the persisted meta data, if the name or depth of the tree is not consistent with what was provided during
    // construction then we throw
    std::vector<uint8_t> data;
    {
        ReadTransactionPtr tx = create_read_transaction();
        bool success = read_persisted_meta(meta, *tx);
        if (success) {
            if (name == meta.name && depth == meta.depth) {
                return;
            }
            throw std::runtime_error("Invalid tree meta data");
        }
    }

    // No meta data available. Write the initial state down
    meta.name = name;
    meta.size = 0;
    meta.depth = depth;
    meta.initialSize = 0;
    meta.finalisedBlockHeight = 0;
    meta.finalisedBlockHeight = 0;
    WriteTransactionPtr tx = create_write_transaction();
    try {
        persist_meta(meta, *tx);
        tx->commit();
    } catch (std::exception& e) {
        tx->try_abort();
        throw e;
    }
}

} // namespace bb::crypto::merkle_tree
