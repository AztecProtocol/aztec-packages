#pragma once
#include "./tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "msgpack/assert.hpp"
#include <cstdint>
#include <exception>
#include <memory>
#include <unordered_map>
#include <utility>

namespace bb::crypto::merkle_tree {

/**
 * @brief Serves as a key-value node store for merkle trees, uses an unordered_map as a cache
 */
template <typename PersistedStore, typename LeafValueType> class CachedTreeStore {
  public:
    using LeafType = LeafValueType;
    using IndexedLeafValueType = IndexedLeaf<LeafValueType>;
    using ReadTransaction = typename PersistedStore::ReadTransaction;
    using WriteTransaction = typename PersistedStore::WriteTransaction;
    using ReadTransactionPtr = std::unique_ptr<ReadTransaction>;
    using WriteTransactionPtr = std::unique_ptr<WriteTransaction>;

    CachedTreeStore(std::string name, uint32_t levels, PersistedStore& dataStore)
        : name(std::move(name))
        , depth(levels)
        , nodes(std::vector<std::unordered_map<index_t, std::vector<uint8_t>>>(
              depth + 1, std::unordered_map<index_t, std::vector<uint8_t>>()))
        , dataStore(dataStore)
    {
        initialise();
    }
    ~CachedTreeStore() = default;

    CachedTreeStore() = delete;
    CachedTreeStore(CachedTreeStore const& other) = delete;
    CachedTreeStore(CachedTreeStore const&& other) = delete;
    CachedTreeStore& operator=(CachedTreeStore const& other) = delete;
    CachedTreeStore& operator=(CachedTreeStore const&& other) = delete;

    std::pair<bool, index_t> find_low_value(const LeafValueType& new_value,
                                            bool includeUncommitted,
                                            ReadTransaction& tx) const;

    IndexedLeafValueType get_leaf(const index_t& index, ReadTransaction& tx, bool includeUncommitted) const;

    void set_at_index(const index_t& index, const IndexedLeafValueType& leaf, bool add_to_index);

    void put_node(uint32_t level, index_t index, const std::vector<uint8_t>& data);

    bool get_node(uint32_t level,
                  index_t index,
                  std::vector<uint8_t>& data,
                  ReadTransaction& transaction,
                  bool includeUncommitted) const;

    void put_meta(const index_t& size, const bb::fr& root);

    void get_meta(index_t& size, bb::fr& root, ReadTransaction& tx, bool includeUncommitted) const;

    void get_full_meta(index_t& size,
                       bb::fr& root,
                       std::string& name,
                       uint32_t& depth,
                       ReadTransaction& tx,
                       bool includeUncommitted) const;

    void commit();

    void rollback();

    ReadTransactionPtr createReadTransaction() const { return dataStore.createReadTransaction(); }

  private:
    std::string name;
    uint32_t depth;
    std::vector<std::unordered_map<index_t, std::vector<uint8_t>>> nodes;
    std::map<uint256_t, index_t> indices_;
    std::unordered_map<index_t, IndexedLeafValueType> leaves_;
    PersistedStore& dataStore;
    TreeMeta meta;

    void initialise();

    bool readPersistedMeta(TreeMeta& m, ReadTransaction& tx) const;

    void persistMeta(TreeMeta& m, WriteTransaction& tx);

    WriteTransactionPtr createWriteTransaction() const { return dataStore.createWriteTransaction(); }
};

template <typename PersistedStore, typename LeafValueType>
std::pair<bool, index_t> CachedTreeStore<PersistedStore, LeafValueType>::find_low_value(const LeafValueType& new_value,
                                                                                        bool includeUncommitted,
                                                                                        ReadTransaction& tx) const
{
    uint256_t new_value_as_number = uint256_t(new_value.get_key());
    std::vector<uint8_t> data;
    FrKeyType key(new_value.get_key());
    tx.get_value_or_previous(key, data);
    auto db_index = from_buffer<index_t>(data, 0);
    uint256_t retrieved_value = key;
    if (!includeUncommitted || retrieved_value == new_value_as_number || indices_.empty()) {
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

template <typename PersistedStore, typename LeafValueType>
typename CachedTreeStore<PersistedStore, LeafValueType>::IndexedLeafValueType CachedTreeStore<
    PersistedStore,
    LeafValueType>::get_leaf(const index_t& index, ReadTransaction& tx, bool includeUncommitted) const
{
    if (includeUncommitted) {
        typename std::unordered_map<index_t, IndexedLeafValueType>::const_iterator it = leaves_.find(index);
        if (it != leaves_.end()) {
            return it->second;
        }
    }
    IndexedLeafValueType return_value;
    LeafIndexKeyType key = index;
    std::vector<uint8_t> data;
    bool success = tx.get_value_by_integer(key, data);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(return_value);
    }
    return return_value;
}

template <typename PersistedStore, typename LeafValueType>
void CachedTreeStore<PersistedStore, LeafValueType>::set_at_index(const index_t& index,
                                                                  const IndexedLeafValueType& leaf,
                                                                  bool add_to_index)
{
    leaves_[index] = leaf;
    if (add_to_index) {
        indices_[uint256_t(leaf.value.get_key())] = index;
    }
}

template <typename PersistedStore, typename LeafValueType>
void CachedTreeStore<PersistedStore, LeafValueType>::put_node(uint32_t level,
                                                              index_t index,
                                                              const std::vector<uint8_t>& data)
{
    nodes[level][index] = data;
}

template <typename PersistedStore, typename LeafValueType>
bool CachedTreeStore<PersistedStore, LeafValueType>::get_node(uint32_t level,
                                                              index_t index,
                                                              std::vector<uint8_t>& data,
                                                              ReadTransaction& transaction,
                                                              bool includeUncommitted) const
{
    if (includeUncommitted) {
        const auto& level_map = nodes[level];
        auto it = level_map.find(index);
        if (it != level_map.end()) {
            data = it->second;
            return true;
        }
    }
    return transaction.get_node(level, index, data);
}

template <typename PersistedStore, typename LeafValueType>
void CachedTreeStore<PersistedStore, LeafValueType>::put_meta(const index_t& size, const bb::fr& root)
{
    meta.root = root;
    meta.size = size;
}

template <typename PersistedStore, typename LeafValueType>
void CachedTreeStore<PersistedStore, LeafValueType>::get_meta(index_t& size,
                                                              bb::fr& root,
                                                              ReadTransaction& tx,
                                                              bool includeUncommitted) const
{
    if (includeUncommitted) {
        size = meta.size;
        root = meta.root;
        return;
    }
    TreeMeta m;
    readPersistedMeta(m, tx);
    size = m.size;
    root = m.root;
}

template <typename PersistedStore, typename LeafValueType>
void CachedTreeStore<PersistedStore, LeafValueType>::get_full_meta(
    index_t& size, bb::fr& root, std::string& name, uint32_t& depth, ReadTransaction& tx, bool includeUncommitted) const
{
    if (includeUncommitted) {
        size = meta.size;
        root = meta.root;
        name = meta.name;
        depth = meta.depth;
        return;
    }
    TreeMeta m;
    readPersistedMeta(m, tx);
    size = m.size;
    root = m.root;
    depth = m.depth;
    name = m.name;
}

template <typename PersistedStore, typename LeafValueType> void CachedTreeStore<PersistedStore, LeafValueType>::commit()
{
    {
        WriteTransactionPtr tx = createWriteTransaction();
        try {
            for (uint32_t i = 1; i < nodes.size(); i++) {
                auto& level = nodes[i];
                for (auto& item : level) {
                    index_t index = item.first;
                    std::vector<uint8_t>& data = item.second;
                    tx->put_node(i, index, data);
                }
            }
            for (auto& idx : indices_) {
                std::vector<uint8_t> value;
                write(value, idx.second);
                FrKeyType key = idx.first;
                tx->put_value_by_integer(key, value);
            }
            for (const auto& leaf : leaves_) {
                msgpack::sbuffer buffer;
                msgpack::pack(buffer, leaf.second);
                std::vector<uint8_t> value(buffer.data(), buffer.data() + buffer.size());
                LeafIndexKeyType key = leaf.first;
                tx->put_value_by_integer(key, value);
            }
            persistMeta(meta, *tx);
            tx->commit();
        } catch (std::exception& e) {
            tx->try_abort();
            throw;
        }
    }
    rollback();
}

template <typename PersistedStore, typename LeafValueType>
void CachedTreeStore<PersistedStore, LeafValueType>::rollback()
{
    nodes = std::vector<std::unordered_map<index_t, std::vector<uint8_t>>>(
        depth + 1, std::unordered_map<index_t, std::vector<uint8_t>>());
    indices_ = std::map<uint256_t, index_t>();
    leaves_ = std::unordered_map<index_t, IndexedLeafValueType>();
    ReadTransactionPtr tx = createReadTransaction();
    readPersistedMeta(meta, *tx);
}

template <typename PersistedStore, typename LeafValueType>
bool CachedTreeStore<PersistedStore, LeafValueType>::readPersistedMeta(TreeMeta& m, ReadTransaction& tx) const
{
    std::vector<uint8_t> data;
    bool success = tx.get_node(0, 0, data);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(m);
    }
    return success;
}

template <typename PersistedStore, typename LeafValueType>
void CachedTreeStore<PersistedStore, LeafValueType>::persistMeta(TreeMeta& m, WriteTransaction& tx)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, m);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    tx.put_node(0, 0, encoded);
}

template <typename PersistedStore, typename LeafValueType>
void CachedTreeStore<PersistedStore, LeafValueType>::initialise()
{
    std::vector<uint8_t> data;
    {
        ReadTransactionPtr tx = createReadTransaction();
        bool success = readPersistedMeta(meta, *tx);
        if (success) {
            if (name == meta.name && depth == meta.depth) {
                return;
            }
            throw std::runtime_error("Invalid tree meta data");
        }
    }

    meta.name = name;
    meta.size = 0;
    meta.depth = depth;
    WriteTransactionPtr tx = createWriteTransaction();
    try {
        persistMeta(meta, *tx);
        tx->commit();
    } catch (std::exception& e) {
        tx->try_abort();
        throw e;
    }
}

} // namespace bb::crypto::merkle_tree