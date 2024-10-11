#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
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

std::ostream& operator<<(std::ostream& os, const StatsMap& stats)
{
    for (const auto& it : stats) {
        os << it.second << std::endl;
    }
    return os;
}

LMDBTreeStore::LMDBTreeStore(std::string directory, std::string name, uint64_t mapSizeKb, uint64_t maxNumReaders)
    : _name(std::move(name))
    , _directory(std::move(directory))
    , _environment(std::make_shared<LMDBEnvironment>(_directory, mapSizeKb, 5, maxNumReaders))
{

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _blockDatabase = std::make_unique<LMDBDatabase>(
            _environment, tx, _name + std::string("blocks"), false, false, block_key_cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _nodeDatabase =
            std::make_unique<LMDBDatabase>(_environment, tx, _name + std::string("nodes"), false, false, fr_key_cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _leafValueToIndexDatabase = std::make_unique<LMDBDatabase>(
            _environment, tx, _name + std::string("leaf indices"), false, false, fr_key_cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _leafHashToPreImageDatabase = std::make_unique<LMDBDatabase>(
            _environment, tx, _name + std::string("leaf pre-images"), false, false, fr_key_cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _leafIndexToKeyDatabase = std::make_unique<LMDBDatabase>(
            _environment, tx, _name + std::string("leaf keys"), false, false, index_key_cmp);
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

void LMDBTreeStore::get_stats(StatsMap& stats, ReadTransaction& tx)
{

    MDB_stat stat;
    MDB_envinfo info;
    call_lmdb_func(mdb_env_info, _environment->underlying(), &info);
    call_lmdb_func(mdb_stat, tx.underlying(), _blockDatabase->underlying(), &stat);
    stats["blocks"] = DBStats("block", info, stat);
    call_lmdb_func(mdb_stat, tx.underlying(), _leafHashToPreImageDatabase->underlying(), &stat);
    stats["leaf preimages"] = DBStats("leaf preimages", info, stat);
    call_lmdb_func(mdb_stat, tx.underlying(), _leafValueToIndexDatabase->underlying(), &stat);
    stats["leaf indices"] = DBStats("leaf indices", info, stat);
    call_lmdb_func(mdb_stat, tx.underlying(), _nodeDatabase->underlying(), &stat);
    stats["nodes"] = DBStats("nodes", info, stat);
    call_lmdb_func(mdb_stat, tx.underlying(), _leafIndexToKeyDatabase->underlying(), &stat);
    stats["leaf keys"] = DBStats("leaf keys", info, stat);
}

void LMDBTreeStore::write_block_data(uint64_t blockNumber,
                                     const BlockPayload& blockData,
                                     LMDBTreeStore::WriteTransaction& tx)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, blockData);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    BlockMetaKeyType key(blockNumber);
    tx.put_value<BlockMetaKeyType>(key, encoded, *_blockDatabase);
}

void LMDBTreeStore::delete_block_data(uint64_t blockNumber, LMDBTreeStore::WriteTransaction& tx)
{
    BlockMetaKeyType key(blockNumber);
    tx.delete_value<BlockMetaKeyType>(key, *_blockDatabase);
}

bool LMDBTreeStore::read_block_data(uint64_t blockNumber, BlockPayload& blockData, LMDBTreeStore::ReadTransaction& tx)
{
    BlockMetaKeyType key(blockNumber);
    std::vector<uint8_t> data;
    bool success = tx.get_value<BlockMetaKeyType>(key, data, *_blockDatabase);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(blockData);
    }
    return success;
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

void LMDBTreeStore::write_leaf_indices(const fr& leafValue, const Indices& indices, LMDBTreeStore::WriteTransaction& tx)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, indices);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    FrKeyType key(leafValue);
    // std::cout << "Writing leaf indices by key " << key << std::endl;
    tx.put_value<FrKeyType>(key, encoded, *_leafValueToIndexDatabase);
}

void LMDBTreeStore::delete_leaf_indices(const fr& leafValue, LMDBTreeStore::WriteTransaction& tx)
{
    FrKeyType key(leafValue);
    // std::cout << "Deleting leaf indices by key " << key << std::endl;
    tx.delete_value(key, *_leafValueToIndexDatabase);
}

void LMDBTreeStore::increment_node_reference_count(const fr& nodeHash, WriteTransaction& tx)
{
    NodePayload nodePayload;
    bool success = get_node_data(nodeHash, nodePayload, tx);
    if (!success) {
        throw std::runtime_error("Failed to find node when attempting to increases reference count");
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
        throw std::runtime_error("Failed to find node when attempting to increases reference count");
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
                                Indices& indices,
                                std::optional<index_t> sizeLimit,
                                ReadTransaction& tx)
{
    std::vector<uint8_t> data;
    FrKeyType key(leafValue);
    auto is_valid = [&](const std::vector<uint8_t>& data) {
        Indices tmp;
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(tmp);
        return tmp.indices[0] < sizeLimit.value();
    };
    if (!sizeLimit.has_value()) {
        tx.get_value_or_previous(key, data, *_leafValueToIndexDatabase);
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(indices);
    } else {
        tx.get_value_or_previous(key, data, *_leafValueToIndexDatabase, is_valid);
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(indices);
    }
    return key;
}

void LMDBTreeStore::write_leaf_key_by_index(const fr& leafKey, const index_t& index, WriteTransaction& tx)
{
    std::vector<uint8_t> data = to_buffer(leafKey);
    LeafIndexKeyType key(index);
    tx.put_value<LeafIndexKeyType>(key, data, *_leafIndexToKeyDatabase);
}

void LMDBTreeStore::delete_all_leaf_keys_after_or_equal_index(const index_t& index, WriteTransaction& tx)
{
    LeafIndexKeyType key(index);
    tx.delete_all_values_greater_or_equal_key(key, *_leafIndexToKeyDatabase);
}

void LMDBTreeStore::delete_all_leaf_keys_before_or_equal_index(const index_t& index, WriteTransaction& tx)
{
    LeafIndexKeyType key(index);
    tx.delete_all_values_lesser_or_equal_key(key, *_leafIndexToKeyDatabase);
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