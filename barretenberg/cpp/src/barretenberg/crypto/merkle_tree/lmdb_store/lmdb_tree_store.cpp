#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
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
#include <vector>

namespace bb::crypto::merkle_tree {

LMDBTreeStore::LMDBTreeStore(
    LMDBEnvironment& environment, std::string name, bool integerKeys, bool reverseKeys, MDB_cmp_func* cmp)
    : _environment(environment)
    , _name(std::move(name))
{
    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _blockDatabase = std::make_unique<LMDBDatabase>(
            _environment, tx, _name + std::string("blocks"), integerKeys, reverseKeys, cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _nodeDatabase = std::make_unique<LMDBDatabase>(
            _environment, tx, _name + std::string("nodes"), integerKeys, reverseKeys, cmp);
        tx.commit();
    }

    {
        LMDBDatabaseCreationTransaction tx(_environment);
        _leafValueDatabase = std::make_unique<LMDBDatabase>(
            _environment, tx, _name + std::string("leaf values"), integerKeys, reverseKeys, cmp);
        tx.commit();
    }
}

LMDBTreeStore::WriteTransaction::Ptr LMDBTreeStore::create_write_transaction() const
{
    return std::make_unique<LMDBTreeWriteTransaction>(_environment);
}
LMDBTreeStore::ReadTransaction::Ptr LMDBTreeStore::create_read_transaction()
{
    _environment.wait_for_reader();
    return std::make_unique<LMDBTreeReadTransaction>(_environment);
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

bool LMDBTreeStore::read_leaf_indices(const fr& leafValue, Indices& indices, LMDBTreeStore::ReadTransaction& tx)
{
    FrKeyType key(leafValue);
    std::vector<uint8_t> data;
    bool success = tx.get_value<FrKeyType>(key, data, *_leafValueDatabase);
    if (success) {
        msgpack::unpack((const char*)data.data(), data.size()).get().convert(indices);
    }
    return success;
}

void LMDBTreeStore::write_leaf_indices(const fr& leafValue, const Indices& indices, LMDBTreeStore::WriteTransaction& tx)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, indices);
    std::vector<uint8_t> encoded(buffer.data(), buffer.data() + buffer.size());
    FrKeyType key(leafValue);
    tx.put_value<FrKeyType>(key, encoded, *_leafValueDatabase);
}

// bool LMDBTreeStore::read_leaf_hash(const index_t& leafIndex, fr& hash, LMDBTreeStore::ReadTransaction& tx)
// {
//     LeafIndexKeyType key(leafIndex);
//     std::vector<uint8_t> data;
//     bool success = tx.get_value<LeafIndexKeyType>(key, data, *_nodeDatabase);
//     if (success) {
//         hash = from_buffer<fr>(data, 0);
//     }
//     return success;
// }

// void LMDBTreeStore::write_leaf_hash(const index_t& leafIndex, const fr& hash, LMDBTreeStore::WriteTransaction& tx)
// {
//     std::vector<uint8_t> data;
//     write(data, hash);
//     LeafIndexKeyType key(leafIndex);
//     tx.put_value<LeafIndexKeyType>(key, data, *_nodeDatabase);
// }

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

fr LMDBTreeStore::find_low_leaf(const fr& leafValue, Indices& indices, ReadTransaction& tx)
{
    std::vector<uint8_t> data;
    FrKeyType key(leafValue);
    tx.get_value_or_previous(key, data, *_leafValueDatabase);
    msgpack::unpack((const char*)data.data(), data.size()).get().convert(indices);
    return key;
}

} // namespace bb::crypto::merkle_tree