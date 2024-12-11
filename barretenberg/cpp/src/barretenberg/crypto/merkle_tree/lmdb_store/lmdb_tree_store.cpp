#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_db_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "lmdb_tree_store.hpp"
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <exception>
#include <lmdb.h>
#include <optional>
#include <stdexcept>
#include <unordered_map>
#include <vector>

namespace bb::crypto::merkle_tree {

/**
 * Integer key comparison function.
 * Most of our databases contain only a single key size
 * The block database uses keys of 1 byte and 8 bytes
 */
int fr_key_cmp(const MDB_val* a, const MDB_val* b)
{
    return value_cmp<numeric::uint256_t>(a, b);
}

int block_key_cmp(const MDB_val* a, const MDB_val* b)
{
    if (a->mv_size != b->mv_size) {
        return size_cmp(a, b);
    }
    if (a->mv_size == 1) {
        return value_cmp<uint8_t>(a, b);
    }
    return value_cmp<uint64_t>(a, b);
}

int index_key_cmp(const MDB_val* a, const MDB_val* b)
{
    return value_cmp<uint64_t>(a, b);
}

LMDBTreeStore::LMDBTreeStore(std::string directory, std::string name, uint64_t mapSizeKb, uint64_t maxNumReaders)
    : _name(std::move(name))
    , _directory(std::move(directory))
    , _environment(std::make_shared<LMDBEnvironment>(_directory, mapSizeKb, 5, maxNumReaders))
{

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _blockDatabase =
            std::make_unique<LMDBDatabase>(_environment, tx, _name + BLOCKS_DB, false, false, block_key_cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _nodeDatabase = std::make_unique<LMDBDatabase>(_environment, tx, _name + NODES_DB, false, false, fr_key_cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _leafKeyToIndexDatabase =
            std::make_unique<LMDBDatabase>(_environment, tx, _name + LEAF_INDICES_DB, false, false, fr_key_cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _leafHashToPreImageDatabase =
            std::make_unique<LMDBDatabase>(_environment, tx, _name + LEAF_PREIMAGES_DB, false, false, fr_key_cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _indexToBlockDatabase =
            std::make_unique<LMDBDatabase>(_environment, tx, _name + BLOCK_INDICES_DB, false, false, index_key_cmp);
        tx.commit();
    }
}

LMDBTreeStore::WriteTransaction::Ptr LMDBTreeStore::create_write_transaction() const
{
    return std::make_unique<LMDBTreeWriteTransaction>(_environment);
}
LMDBTreeStore::ReadTransaction::Ptr LMDBTreeStore::create_read_transaction()
{
    _environment->wait_for_reader();
    return std::make_unique<LMDBTreeReadTransaction>(_environment);
}

void LMDBTreeStore::get_stats(TreeDBStats& stats, ReadTransaction& tx)
{

    MDB_stat stat;
    MDB_envinfo info;
    call_lmdb_func(mdb_env_info, _environment->underlying(), &info);
    stats.mapSize = info.me_mapsize;
    call_lmdb_func(mdb_stat, tx.underlying(), _blockDatabase->underlying(), &stat);
    stats.blocksDBStats = DBStats(BLOCKS_DB, stat);
    call_lmdb_func(mdb_stat, tx.underlying(), _leafHashToPreImageDatabase->underlying(), &stat);
    stats.leafPreimagesDBStats = DBStats(LEAF_PREIMAGES_DB, stat);
    call_lmdb_func(mdb_stat, tx.underlying(), _leafKeyToIndexDatabase->underlying(), &stat);
    stats.leafIndicesDBStats = DBStats(LEAF_INDICES_DB, stat);
    call_lmdb_func(mdb_stat, tx.underlying(), _nodeDatabase->underlying(), &stat);
    stats.nodesDBStats = DBStats(NODES_DB, stat);
    call_lmdb_func(mdb_stat, tx.underlying(), _indexToBlockDatabase->underlying(), &stat);
    stats.blockIndicesDBStats = DBStats(BLOCK_INDICES_DB, stat);
}

void LMDBTreeStore::write_block_data(const block_number_t& blockNumber,
                                     const BlockPayload& blockData,
                                     LMDBTreeStore::WriteTransaction& tx)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, blockData);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    BlockMetaKeyType key(blockNumber);
    tx.put_value<BlockMetaKeyType>(key, encoded, *_blockDatabase);
}

void LMDBTreeStore::delete_block_data(const block_number_t& blockNumber, LMDBTreeStore::WriteTransaction& tx)
{
    BlockMetaKeyType key(blockNumber);
    tx.delete_value<BlockMetaKeyType>(key, *_blockDatabase);
}

bool LMDBTreeStore::read_block_data(const block_number_t& blockNumber,
                                    BlockPayload& blockData,
                                    LMDBTreeStore::ReadTransaction& tx)
{
    BlockMetaKeyType key(blockNumber);
    std::vector<uint8_t> data;
    bool success = tx.get_value<BlockMetaKeyType>(key, data, *_blockDatabase);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(blockData);
    }
    return success;
}

void LMDBTreeStore::write_block_index_data(const block_number_t& blockNumber,
                                           const index_t& sizeAtBlock,
                                           WriteTransaction& tx)
{
    // There can be multiple block numbers aganst the same index (zero size blocks)
    LeafIndexKeyType key(sizeAtBlock);
    std::vector<uint8_t> data;
    // Read the block index payload
    bool success = tx.get_value<LeafIndexKeyType>(key, data, *_indexToBlockDatabase);
    BlockIndexPayload payload;
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(payload);
    }

    // Double check it's not already present (it shouldn't be)
    // We then add the block number and sort
    // Sorting shouldn't be necessary as we add blocks in ascending order, but we will make sure
    // Sorting here and when we unwind blocks means that looking up the block number for an index becomes O(1)
    // These lookups are much more frequent than adds or deletes so we take the hit here
    if (!payload.contains(blockNumber)) {
        payload.blockNumbers.emplace_back(blockNumber);
        payload.sort();
    }

    // Write the new payload back down
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, payload);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    tx.put_value<BlockMetaKeyType>(key, encoded, *_indexToBlockDatabase);
}

bool LMDBTreeStore::find_block_for_index(const index_t& index, block_number_t& blockNumber, ReadTransaction& tx)
{
    LeafIndexKeyType key(index + 1);
    std::vector<uint8_t> data;
    // Retrieve the payload
    bool success = tx.get_value_or_greater<LeafIndexKeyType>(key, data, *_indexToBlockDatabase);
    if (!success) {
        return false;
    }
    BlockIndexPayload payload;
    msgpack::unpack((const char*)data.data(), data.size()).get().convert(payload);
    if (payload.blockNumbers.empty()) {
        return false;
    }
    // The block numbers are sorted so we simply return the lowest
    blockNumber = payload.blockNumbers[0];
    return true;
}

void LMDBTreeStore::delete_block_index(const index_t& sizeAtBlock,
                                       const block_number_t& blockNumber,
                                       WriteTransaction& tx)
{
    // To delete a block number form an index we retieve all the block numbers from that index
    // Then we find and remove the block number in question
    // Then we write back down
    LeafIndexKeyType key(sizeAtBlock);
    std::vector<uint8_t> data;
    // Retrieve the data
    bool success = tx.get_value<LeafIndexKeyType>(key, data, *_indexToBlockDatabase);
    if (!success) {
        return;
    }
    BlockIndexPayload payload;
    msgpack::unpack((const char*)data.data(), data.size()).get().convert(payload);

    payload.delete_block(blockNumber);

    // if it's now empty, delete it
    if (payload.blockNumbers.empty()) {
        tx.delete_value(key, *_indexToBlockDatabase);
        return;
    }
    // not empty write it back
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, payload);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    tx.put_value<BlockMetaKeyType>(key, encoded, *_indexToBlockDatabase);
}

void LMDBTreeStore::write_meta_data(const TreeMeta& metaData, LMDBTreeStore::WriteTransaction& tx)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, metaData);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    MetaKeyType key(0);
    tx.put_value<MetaKeyType>(key, encoded, *_blockDatabase);
}

bool LMDBTreeStore::read_meta_data(TreeMeta& metaData, LMDBTreeStore::ReadTransaction& tx)
{
    MetaKeyType key(0);
    std::vector<uint8_t> data;
    bool success = tx.get_value<MetaKeyType>(key, data, *_blockDatabase);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(metaData);
    }
    return success;
}

void LMDBTreeStore::write_leaf_index(const fr& leafValue, const index_t& index, LMDBTreeStore::WriteTransaction& tx)
{
    FrKeyType key(leafValue);
    // std::cout << "Writing leaf indices by key " << key << std::endl;
    tx.put_value<FrKeyType>(key, index, *_leafKeyToIndexDatabase);
}

void LMDBTreeStore::delete_leaf_index(const fr& leafValue, LMDBTreeStore::WriteTransaction& tx)
{
    FrKeyType key(leafValue);
    // std::cout << "Deleting leaf indices by key " << key << std::endl;
    tx.delete_value(key, *_leafKeyToIndexDatabase);
}

void LMDBTreeStore::increment_node_reference_count(const fr& nodeHash, WriteTransaction& tx)
{
    NodePayload nodePayload;
    bool success = get_node_data(nodeHash, nodePayload, tx);
    if (!success) {
        throw std::runtime_error("Failed to find node when attempting to increase reference count");
    }
    ++nodePayload.ref;
    // std::cout << "Incrementing siblng at " << nodeHash << ", to " << nodePayload.ref << std::endl;
    write_node(nodeHash, nodePayload, tx);
}

void LMDBTreeStore::set_or_increment_node_reference_count(const fr& nodeHash,
                                                          NodePayload& nodeData,
                                                          WriteTransaction& tx)
{
    // Set to zero here and enrich from DB if present
    nodeData.ref = 0;
    get_node_data(nodeHash, nodeData, tx);
    // Increment now to the correct value
    ++nodeData.ref;
    // std::cout << "Setting node at " << nodeHash << ", to " << nodeData.ref << std::endl;
    write_node(nodeHash, nodeData, tx);
}

void LMDBTreeStore::decrement_node_reference_count(const fr& nodeHash, NodePayload& nodeData, WriteTransaction& tx)
{
    bool success = get_node_data(nodeHash, nodeData, tx);
    if (!success) {
        throw std::runtime_error("Failed to find node when attempting to decrease reference count");
    }
    if (--nodeData.ref == 0) {
        // std::cout << "Deleting node at " << nodeHash << std::endl;
        tx.delete_value(nodeHash, *_nodeDatabase);
        return;
    }
    // std::cout << "Updating node at " << nodeHash << " ref is now " << nodeData.ref << std::endl;
    write_node(nodeHash, nodeData, tx);
}

void LMDBTreeStore::delete_leaf_by_hash(const fr& leafHash, WriteTransaction& tx)
{
    FrKeyType key(leafHash);
    tx.delete_value(key, *_leafHashToPreImageDatabase);
}

fr LMDBTreeStore::find_low_leaf(const fr& leafValue,
                                index_t& index,
                                const std::optional<index_t>& sizeLimit,
                                ReadTransaction& tx)
{
    FrKeyType key(leafValue);
    auto is_valid = [&](const MDB_val& data) {
        index_t tmp = 0;
        deserialise_key(data.mv_data, tmp);
        return tmp < sizeLimit.value();
    };
    if (!sizeLimit.has_value()) {
        tx.get_value_or_previous(key, index, *_leafKeyToIndexDatabase);
    } else {
        tx.get_value_or_previous(key, index, *_leafKeyToIndexDatabase, is_valid);
    }
    return key;
}

bool LMDBTreeStore::read_node(const fr& nodeHash, NodePayload& nodeData, ReadTransaction& tx)
{
    FrKeyType key(nodeHash);
    std::vector<uint8_t> data;
    bool success = tx.get_value<FrKeyType>(key, data, *_nodeDatabase);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(nodeData);
    }
    return success;
}

void LMDBTreeStore::write_node(const fr& nodeHash, const NodePayload& nodeData, WriteTransaction& tx)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, nodeData);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    FrKeyType key(nodeHash);
    tx.put_value<FrKeyType>(key, encoded, *_nodeDatabase);
}

} // namespace bb::crypto::merkle_tree