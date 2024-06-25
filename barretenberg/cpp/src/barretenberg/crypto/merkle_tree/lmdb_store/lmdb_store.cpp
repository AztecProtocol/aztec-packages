#include "lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <lmdb.h>
#include <vector>

namespace bb::crypto::merkle_tree {

int SizeCmp(const MDB_val* a, const MDB_val* b)
{
    if (a->mv_size < b->mv_size) {
        return -1;
    }
    if (a->mv_size > b->mv_size) {
        return 1;
    }
    return 0;
}

int Invalid(const MDB_val*, const MDB_val*)
{
    throw std::runtime_error("Invalid comparison");
}

int IntegerKeyCmp(const MDB_val* a, const MDB_val* b)
{
    // std::cout << "A size " << a->mv_size << " B size " << b->mv_size << std::endl;
    if (a->mv_size != b->mv_size) {
        return SizeCmp(a, b);
    }

    using f_type = std::function<MDB_cmp_func>;
    static std::vector<f_type> functions{
        ValueCmp<uint8_t>, ValueCmp<uint64_t>, ValueCmp<uint128_t>, Invalid, ValueCmp<uint256_t>
    };
    return functions[a->mv_size / 8](a, b);
}

LMDBEnvironment::LMDBEnvironment(const std::string& directory,
                                 uint64_t mapSizeMB,
                                 uint32_t maxNumDBs,
                                 uint32_t maxNumReaders)
    : _maxReaders(maxNumReaders)
    , _numReaders(0)
{
    if (!call_lmdb_func(mdb_env_create, &_mdbEnv)) {
        // throw here
    }
    uint64_t kb = 1024;
    uint64_t totalMapSize = kb * kb * mapSizeMB;
    call_lmdb_func(mdb_env_set_mapsize, _mdbEnv, totalMapSize);
    call_lmdb_func(mdb_env_set_maxdbs, _mdbEnv, static_cast<MDB_dbi>(maxNumDBs));
    call_lmdb_func(mdb_env_set_maxreaders, _mdbEnv, maxNumReaders);
    uint32_t flags = MDB_NOTLS;
    if (!call_lmdb_func(
            mdb_env_open, _mdbEnv, directory.c_str(), flags, static_cast<mdb_mode_t>(S_IRWXU | S_IRWXG | S_IRWXO))) {
        call_lmdb_func(mdb_env_close, _mdbEnv);
        // throw here
    }
}

void LMDBEnvironment::waitForReader()
{
    std::unique_lock lock(_readersLock);
    if (_numReaders >= _maxReaders) {
        _readersCondition.wait(lock, [&] { return _numReaders < _maxReaders; });
    }
    ++_numReaders;
}

void LMDBEnvironment::releaseReader()
{
    std::unique_lock lock(_readersLock);
    --_numReaders;
    _readersCondition.notify_one();
}

void LMDBWriteTransaction::put_node(uint32_t level, index_t index, std::vector<uint8_t>& data)
{
    NodeKeyType key = (static_cast<NodeKeyType>(1 << level) + static_cast<NodeKeyType>(index)) - 1;
    put_value_by_integer(key, data);
}

void LMDBWriteTransaction::put_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    dbVal.mv_size = data.size();
    dbVal.mv_data = (void*)data.data();
    call_lmdb_func(mdb_put, underlying(), _database.underlying(), &dbKey, &dbVal, 0U);
}

bool LMDBReadTransaction::get_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data) const
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    if (!call_lmdb_func(mdb_get, underlying(), _database.underlying(), &dbKey, &dbVal)) {
        return false;
    }
    data.resize(dbVal.mv_size);
    std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
    return true;
}

bool LMDBReadTransaction::get_node(uint32_t level, index_t index, std::vector<uint8_t>& data) const
{
    NodeKeyType key = (static_cast<NodeKeyType>(1 << level) + static_cast<NodeKeyType>(index)) - 1;
    return get_value_by_integer(key, data);
}

LMDBReadTransaction::Ptr LMDBStore::createReadTransaction()
{
    _environment.waitForReader();
    return std::make_unique<LMDBReadTransaction>(_environment, _database);
}

} // namespace bb::crypto::merkle_tree