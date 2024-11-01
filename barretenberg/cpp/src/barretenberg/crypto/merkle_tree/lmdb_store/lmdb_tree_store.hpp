#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_read_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_write_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "lmdb.h"
#include <cstdint>
#include <optional>
#include <ostream>
#include <string>
#include <typeinfo>
#include <unordered_map>
#include <utility>

namespace bb::crypto::merkle_tree {

struct BlockPayload {

    index_t size;
    index_t blockNumber;
    fr root;

    MSGPACK_FIELDS(size, blockNumber, root)

    bool operator==(const BlockPayload& other) const
    {
        return size == other.size && blockNumber == other.blockNumber && root == other.root;
    }
};

inline std::ostream& operator<<(std::ostream& os, const BlockPayload& block)
{
    os << "BlockPayload{size: " << std::dec << block.size << ", blockNumber: " << std::dec << block.blockNumber
       << ", root: " << block.root << "}";
    return os;
}

struct Indices {
    std::vector<index_t> indices;

    MSGPACK_FIELDS(indices);

    bool operator==(const Indices& other) const { return indices == other.indices; }
};

struct NodePayload {
    std::optional<fr> left;
    std::optional<fr> right;
    uint64_t ref;

    MSGPACK_FIELDS(left, right, ref)

    bool operator==(const NodePayload& other) const
    {
        return left == other.left && right == other.right && ref == other.ref;
    }
};

struct DBStats {
    std::string name;
    uint64_t mapSize;
    uint64_t numDataItems;
    uint64_t totalUsedSize;

    DBStats() = default;
    DBStats(const DBStats& other) = default;
    DBStats(DBStats&& other) noexcept
        : name(std::move(other.name))
        , mapSize(other.mapSize)
        , numDataItems(other.numDataItems)
        , totalUsedSize(other.totalUsedSize)
    {}
    ~DBStats() = default;
    DBStats(std::string name, MDB_envinfo& env, MDB_stat& stat)
        : name(std::move(name))
        , mapSize(env.me_mapsize)
        , numDataItems(stat.ms_entries)
        , totalUsedSize(stat.ms_psize * (stat.ms_branch_pages + stat.ms_leaf_pages + stat.ms_overflow_pages))
    {}

    MSGPACK_FIELDS(name, mapSize, numDataItems, totalUsedSize)

    bool operator==(const DBStats& other) const
    {
        return name == other.name && mapSize == other.mapSize && numDataItems == other.numDataItems &&
               totalUsedSize == other.totalUsedSize;
    }

    DBStats& operator=(const DBStats& other) = default;

    friend std::ostream& operator<<(std::ostream& os, const DBStats& stats)
    {
        os << "DB " << stats.name << ", map size: " << stats.mapSize << ", num items: " << stats.numDataItems
           << ", total used size: " << stats.totalUsedSize;
        return os;
    }
};

using StatsMap = std::unordered_map<std::string, DBStats>;

std::ostream& operator<<(std::ostream& os, const StatsMap& stats);

/**
 * Creates an abstraction against a collection of LMDB databases within a single environment used to store merkle tree
 * data
 */

class LMDBTreeStore {
  public:
    using Ptr = std::unique_ptr<LMDBTreeStore>;
    using SharedPtr = std::shared_ptr<LMDBTreeStore>;
    using ReadTransaction = LMDBTreeReadTransaction;
    using WriteTransaction = LMDBTreeWriteTransaction;
    LMDBTreeStore(std::string directory, std::string name, uint64_t mapSizeKb, uint64_t maxNumReaders);
    LMDBTreeStore(const LMDBTreeStore& other) = delete;
    LMDBTreeStore(LMDBTreeStore&& other) = delete;
    LMDBTreeStore& operator=(const LMDBTreeStore& other) = delete;
    LMDBTreeStore& operator=(LMDBTreeStore&& other) = delete;
    ~LMDBTreeStore() = default;

    WriteTransaction::Ptr create_write_transaction() const;
    ReadTransaction::Ptr create_read_transaction();

    void get_stats(StatsMap& stats, ReadTransaction& tx);

    void write_block_data(uint64_t blockNumber, const BlockPayload& blockData, WriteTransaction& tx);

    bool read_block_data(uint64_t blockNumber, BlockPayload& blockData, ReadTransaction& tx);

    void delete_block_data(uint64_t blockNumber, WriteTransaction& tx);

    void write_meta_data(const TreeMeta& metaData, WriteTransaction& tx);

    bool read_meta_data(TreeMeta& metaData, ReadTransaction& tx);

    template <typename TxType> bool read_leaf_indices(const fr& leafValue, Indices& indices, TxType& tx);

    fr find_low_leaf(const fr& leafValue, Indices& indices, std::optional<index_t> sizeLimit, ReadTransaction& tx);

    void write_leaf_indices(const fr& leafValue, const Indices& indices, WriteTransaction& tx);

    void delete_leaf_indices(const fr& leafValue, WriteTransaction& tx);

    bool read_node(const fr& nodeHash, NodePayload& nodeData, ReadTransaction& tx);

    void write_node(const fr& nodeHash, const NodePayload& nodeData, WriteTransaction& tx);

    void increment_node_reference_count(const fr& nodeHash, WriteTransaction& tx);

    void set_or_increment_node_reference_count(const fr& nodeHash, NodePayload& nodeData, WriteTransaction& tx);

    void decrement_node_reference_count(const fr& nodeHash, NodePayload& nodeData, WriteTransaction& tx);

    template <typename LeafType, typename TxType>
    bool read_leaf_by_hash(const fr& leafHash, LeafType& leafData, TxType& tx);

    template <typename LeafType>
    void write_leaf_by_hash(const fr& leafHash, const LeafType& leafData, WriteTransaction& tx);

    void delete_leaf_by_hash(const fr& leafHash, WriteTransaction& tx);

    void write_leaf_key_by_index(const fr& leafKey, const index_t& index, WriteTransaction& tx);

    template <typename TxType> bool read_leaf_key_by_index(const index_t& index, fr& leafKey, TxType& tx);

    template <typename TxType>
    void read_all_leaf_keys_after_or_equal_index(const index_t& index, std::vector<bb::fr>& leafKeys, TxType& tx);

    void delete_all_leaf_keys_after_or_equal_index(const index_t& index, WriteTransaction& tx);

    template <typename TxType>
    void read_all_leaf_keys_before_or_equal_index(const index_t& index, std::vector<bb::fr>& leafKeys, TxType& tx);

    void delete_all_leaf_keys_before_or_equal_index(const index_t& index, WriteTransaction& tx);

  private:
    std::string _name;
    std::string _directory;
    LMDBEnvironment::SharedPtr _environment;
    LMDBDatabase::Ptr _blockDatabase;
    LMDBDatabase::Ptr _nodeDatabase;
    LMDBDatabase::Ptr _leafValueToIndexDatabase;
    LMDBDatabase::Ptr _leafHashToPreImageDatabase;
    LMDBDatabase::Ptr _leafIndexToKeyDatabase;

    template <typename TxType> bool get_node_data(const fr& nodeHash, NodePayload& nodeData, TxType& tx);
};

template <typename TxType> bool LMDBTreeStore::read_leaf_indices(const fr& leafValue, Indices& indices, TxType& tx)
{
    FrKeyType key(leafValue);
    std::vector<uint8_t> data;
    bool success = tx.template get_value<FrKeyType>(key, data, *_leafValueToIndexDatabase);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(indices);
    }
    return success;
}

template <typename LeafType, typename TxType>
bool LMDBTreeStore::read_leaf_by_hash(const fr& leafHash, LeafType& leafData, TxType& tx)
{
    FrKeyType key(leafHash);
    std::vector<uint8_t> data;
    bool success = tx.template get_value<FrKeyType>(key, data, *_leafHashToPreImageDatabase);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(leafData);
    }
    return success;
}

template <typename LeafType>
void LMDBTreeStore::write_leaf_by_hash(const fr& leafHash, const LeafType& leafData, WriteTransaction& tx)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, leafData);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    FrKeyType key(leafHash);
    tx.put_value<FrKeyType>(key, encoded, *_leafHashToPreImageDatabase);
}

template <typename TxType> bool LMDBTreeStore::get_node_data(const fr& nodeHash, NodePayload& nodeData, TxType& tx)
{
    FrKeyType key(nodeHash);
    std::vector<uint8_t> data;
    bool success = tx.template get_value<FrKeyType>(key, data, *_nodeDatabase);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(nodeData);
    }
    return success;
}

template <typename TxType> bool LMDBTreeStore::read_leaf_key_by_index(const index_t& index, fr& leafKey, TxType& tx)
{
    LeafIndexKeyType key(index);
    std::vector<uint8_t> data;
    bool success = tx.template get_value<LeafIndexKeyType>(key, data, *_leafIndexToKeyDatabase);
    if (success) {
        leafKey = from_buffer<fr>(data);
    }
    return success;
}

template <typename TxType>
void LMDBTreeStore::read_all_leaf_keys_after_or_equal_index(const index_t& index,
                                                            std::vector<bb::fr>& leafKeys,
                                                            TxType& tx)
{
    LeafIndexKeyType key(index);
    std::vector<std::vector<uint8_t>> values;
    tx.get_all_values_greater_or_equal_key(key, values, *_leafIndexToKeyDatabase);
    for (const auto& value : values) {
        fr leafKey = from_buffer<fr>(value);
        leafKeys.push_back(leafKey);
    }
}

template <typename TxType>
void LMDBTreeStore::read_all_leaf_keys_before_or_equal_index(const index_t& index,
                                                             std::vector<bb::fr>& leafKeys,
                                                             TxType& tx)
{
    LeafIndexKeyType key(index);
    std::vector<std::vector<uint8_t>> values;
    tx.get_all_values_lesser_or_equal_key(key, values, *_leafIndexToKeyDatabase);
    for (const auto& value : values) {
        fr leafKey = from_buffer<fr>(value);
        leafKeys.push_back(leafKey);
    }
}
} // namespace bb::crypto::merkle_tree
