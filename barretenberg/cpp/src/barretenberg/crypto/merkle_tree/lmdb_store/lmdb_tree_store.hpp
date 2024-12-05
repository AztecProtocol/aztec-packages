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
#include "barretenberg/world_state/types.hpp"
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
    block_number_t blockNumber;
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

struct BlockIndexPayload {
    std::vector<block_number_t> blockNumbers;

    MSGPACK_FIELDS(blockNumbers)

    bool operator==(const BlockIndexPayload& other) const { return blockNumbers == other.blockNumbers; }

    void sort() { std::sort(blockNumbers.begin(), blockNumbers.end()); }

    bool contains(const block_number_t& blockNumber)
    {
        auto it = std::lower_bound(blockNumbers.begin(), blockNumbers.end(), blockNumber);
        if (it == blockNumbers.end()) {
            // The block was not found, we can return
            return false;
        }
        return *it == blockNumber;
    }

    void delete_block(const block_number_t& blockNumber)
    {
        if (blockNumbers.empty()) {
            return;
        }
        // shuffle the block number down, removing the one we want to remove and then pop the end item
        auto it = std::lower_bound(blockNumbers.begin(), blockNumbers.end(), blockNumber);
        if (it == blockNumbers.end()) {
            // The block was not found, we can return
            return;
        }
        // It could be a block higher than the one we are looking for
        if (*it != blockNumber) {
            return;
        }
        // we have found our block, shuffle blocks after this one down
        auto readIt = it + 1;
        while (readIt != blockNumbers.end()) {
            *it++ = *readIt++;
        }
        blockNumbers.pop_back();
    }
};
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

    void get_stats(TreeDBStats& stats, ReadTransaction& tx);

    void write_block_data(const block_number_t& blockNumber, const BlockPayload& blockData, WriteTransaction& tx);

    bool read_block_data(const block_number_t& blockNumber, BlockPayload& blockData, ReadTransaction& tx);

    void delete_block_data(const block_number_t& blockNumber, WriteTransaction& tx);

    void write_block_index_data(const block_number_t& blockNumber, const index_t& sizeAtBlock, WriteTransaction& tx);

    // index here is 0 based
    bool find_block_for_index(const index_t& index, block_number_t& blockNumber, ReadTransaction& tx);

    void delete_block_index(const index_t& sizeAtBlock, const block_number_t& blockNumber, WriteTransaction& tx);

    void write_meta_data(const TreeMeta& metaData, WriteTransaction& tx);

    bool read_meta_data(TreeMeta& metaData, ReadTransaction& tx);

    template <typename TxType> bool read_leaf_index(const fr& leafValue, index_t& leafIndex, TxType& tx);

    fr find_low_leaf(const fr& leafValue, index_t& index, const std::optional<index_t>& sizeLimit, ReadTransaction& tx);

    void write_leaf_index(const fr& leafValue, const index_t& leafIndex, WriteTransaction& tx);

    void delete_leaf_index(const fr& leafValue, WriteTransaction& tx);

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
    LMDBDatabase::Ptr _leafKeyToIndexDatabase;
    LMDBDatabase::Ptr _leafHashToPreImageDatabase;
    LMDBDatabase::Ptr _indexToBlockDatabase;

    template <typename TxType> bool get_node_data(const fr& nodeHash, NodePayload& nodeData, TxType& tx);
};

template <typename TxType> bool LMDBTreeStore::read_leaf_index(const fr& leafValue, index_t& leafIndex, TxType& tx)
{
    FrKeyType key(leafValue);
    return tx.template get_value<FrKeyType>(key, leafIndex, *_leafKeyToIndexDatabase);
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
} // namespace bb::crypto::merkle_tree
