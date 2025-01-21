#pragma once
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_store_base.hpp"
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <optional>
#include <ostream>
#include <stdexcept>
#include <string>
#include <typeinfo>
#include <unordered_map>
#include <utility>

namespace bb::crypto::merkle_tree {

using namespace bb::lmdblib;

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

    bool is_empty() const { return blockNumbers.empty(); }

    block_number_t get_min_block_number() { return blockNumbers[0]; }

    bool contains(const block_number_t& blockNumber)
    {
        if (is_empty()) {
            return false;
        }
        if (blockNumbers.size() == 1) {
            return blockNumbers[0] == blockNumber;
        }
        return blockNumber >= blockNumbers[0] && blockNumber <= blockNumbers[1];
    }

    void delete_block(const block_number_t& blockNumber)
    {
        // Shouldn't be possible, but no need to do anything here
        if (blockNumbers.empty()) {
            return;
        }

        // If the size is 1, the blocknumber must match that in index 0, if it does remove it
        if (blockNumbers.size() == 1) {
            if (blockNumbers[0] == blockNumber) {
                blockNumbers.pop_back();
            }
            return;
        }

        // we have 2 entries, we must verify that the block number is equal to the item in index 1
        if (blockNumbers[1] != blockNumber) {
            throw std::runtime_error(format("Unable to delete block number ",
                                            blockNumber,
                                            " for retrieval by index, current max block number at that index: ",
                                            blockNumbers[1]));
        }
        // It is equal, decrement it, we know that the new block number must have been added previously
        --blockNumbers[1];

        // We have modified the high block. If it is now equal to the low block then pop it
        if (blockNumbers[0] == blockNumbers[1]) {
            blockNumbers.pop_back();
        }
    }

    void add_block(const block_number_t& blockNumber)
    {
        // If empty, just add the block number
        if (blockNumbers.empty()) {
            blockNumbers.emplace_back(blockNumber);
            return;
        }

        // If the size is 1, then we must be adding the block 1 larger than that in index 0
        if (blockNumbers.size() == 1) {
            if (blockNumber != blockNumbers[0] + 1) {
                // We can't accept a block number for this index that does not immediately follow the block before
                throw std::runtime_error(format("Unable to store block number ",
                                                blockNumber,
                                                " for retrieval by index, current max block number at that index: ",
                                                blockNumbers[0]));
            }
            blockNumbers.emplace_back(blockNumber);
            return;
        }

        // Size must be 2 here, if larger, this is an error
        if (blockNumbers.size() != 2) {
            throw std::runtime_error(format("Unable to store block number ",
                                            blockNumber,
                                            " for retrieval by index, block numbers is of invalid size: ",
                                            blockNumbers.size()));
        }

        // If the size is 2, then we must be adding the block 1 larger than that in index 1
        if (blockNumber != blockNumbers[1] + 1) {
            // We can't accept a block number for this index that does not immediately follow the block before
            throw std::runtime_error(format("Unable to store block number ",
                                            blockNumber,
                                            " for retrieval by index, current max block number at that index: ",
                                            blockNumbers[1]));
        }
        blockNumbers[1] = blockNumber;
    }
};
/**
 * Creates an abstraction against a collection of LMDB databases within a single environment used to store merkle tree
 * data
 */

class LMDBTreeStore : public LMDBStoreBase {
  public:
    using Ptr = std::unique_ptr<LMDBTreeStore>;
    using SharedPtr = std::shared_ptr<LMDBTreeStore>;
    using ReadTransaction = LMDBReadTransaction;
    using WriteTransaction = LMDBWriteTransaction;
    LMDBTreeStore(std::string directory, std::string name, uint64_t mapSizeKb, uint64_t maxNumReaders);
    LMDBTreeStore(const LMDBTreeStore& other) = delete;
    LMDBTreeStore(LMDBTreeStore&& other) = delete;
    LMDBTreeStore& operator=(const LMDBTreeStore& other) = delete;
    LMDBTreeStore& operator=(LMDBTreeStore&& other) = delete;
    ~LMDBTreeStore() override = default;

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
