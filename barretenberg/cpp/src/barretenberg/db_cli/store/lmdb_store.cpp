#include "lmdb_store.hpp"

namespace bb::db_cli {

LMDBEnvironment::LMDBEnvironment(const std::string& directory,
                                 unsigned long mapSizeMB,
                                 unsigned long maxNumDBs,
                                 unsigned int maxNumReaders)
    : _maxReaders(maxNumReaders)
    , _numReaders(0)
{
    if (!call_lmdb_func(mdb_env_create, &_mdbEnv)) {
        // throw here
    }
    size_t totalMapSize = 1024 * 1024 * mapSizeMB;
    call_lmdb_func(mdb_env_set_mapsize, _mdbEnv, totalMapSize);
    call_lmdb_func(mdb_env_set_maxdbs, _mdbEnv, (MDB_dbi)maxNumDBs);
    call_lmdb_func(mdb_env_set_maxreaders, _mdbEnv, maxNumReaders);
    if (!call_lmdb_func(mdb_env_open, _mdbEnv, directory.c_str(), 0U, mdb_mode_t(S_IRWXU | S_IRWXG | S_IRWXO))) {
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
    std::cout << " Try Num Readers: " << ++_numReaders << std::endl;
}

void LMDBEnvironment::releaseReader()
{
    std::unique_lock lock(_readersLock);
    std::cout << " Release Num Readers: " << --_numReaders << std::endl;
    _readersCondition.notify_one();
}

void LMDBWriteTransaction::put(size_t level, size_t start_index, std::vector<uint8_t>& data, size_t element_size)
{
    MDB_cursor* cursor;
    call_lmdb_func(mdb_cursor_open, underlying(), _database.underlying(), &cursor);
    size_t key = (1 << level) + start_index - 1;
    size_t num_elements = data.size() / element_size;

    for (size_t i = 0; i < num_elements; ++i, ++key) {
        MDB_val dbKey;
        dbKey.mv_size = sizeof(key);
        dbKey.mv_data = &key;

        MDB_val dbVal;
        dbVal.mv_size = element_size;
        dbVal.mv_data = static_cast<void*>(&data[i * element_size]);
        call_lmdb_func(mdb_cursor_put, cursor, &dbKey, &dbVal, 0U);
    }
}

bool LMDBReadTransaction::get(size_t level, size_t index, std::vector<uint8_t>& data) const
{
    size_t key = (1 << level) + index - 1;

    MDB_val dbKey;
    dbKey.mv_size = sizeof(key);
    dbKey.mv_data = &key;

    MDB_val dbVal;
    if (!call_lmdb_func(mdb_get, underlying(), _database.underlying(), &dbKey, &dbVal)) {
        return false;
    }
    data.resize(dbVal.mv_size);
    std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
    return true;
}

LMDBReadTransaction::Ptr LMDBStore::createReadTransaction()
{
    _environment.waitForReader();
    return std::make_unique<LMDBReadTransaction>(_environment, _database);
}

} // namespace bb::db_cli