#include "lmdb_store.hpp"

namespace bb::crypto::merkle_tree {

LMDBEnvironment::LMDBEnvironment(const std::string& directory)
{
    if (!call_lmdb_func(mdb_env_create, &_mdbEnv)) {
        // throw here
    }
    call_lmdb_func(mdb_env_set_mapsize, _mdbEnv, (size_t)1048576);
    call_lmdb_func(mdb_env_set_maxdbs, _mdbEnv, (MDB_dbi)5);
    if (!call_lmdb_func(mdb_env_open, _mdbEnv, directory.c_str(), 0U, mdb_mode_t(S_IRWXU | S_IRWXG | S_IRWXO))) {
        call_lmdb_func(mdb_env_close, _mdbEnv);
        // throw here
    }
}

LMDBTransaction::LMDBTransaction(const LMDBEnvironment& env, bool readOnly = true)
    : _readOnly(readOnly)
    , _committed(false)
{
    unsigned int flags = _readOnly ? MDB_RDONLY : 0;
    MDB_txn* p = nullptr;
    if (!call_lmdb_func(mdb_txn_begin, env.underlying(), p, flags, &_transaction)) {
        // throw here
    }
}

LMDBTransaction::~LMDBTransaction()
{
    if (_readOnly) {
        call_lmdb_func(mdb_txn_abort, _transaction);
    } else if (!_committed) {
        call_lmdb_func(mdb_txn_commit, _transaction);
    }
}

MDB_txn* LMDBTransaction::underlying() const
{
    return _transaction;
}

bool LMDBTransaction::commit()
{
    if (_committed) {
        return true;
    }
    _committed = call_lmdb_func(mdb_txn_commit, _transaction);
    return _committed;
}

LMDBDatabase::LMDBDatabase(const LMDBEnvironment& env, const LMDBTransaction& transaction, const std::string& name)
    : _environment(env)
{
    unsigned int flags = MDB_CREATE;
    if (!call_lmdb_func(mdb_dbi_open, transaction.underlying(), name.c_str(), flags, &_dbi)) {
        // throw here
    }
}

LMDBDatabase::~LMDBDatabase()
{
    call_lmdb_func(mdb_dbi_close, _environment.underlying(), _dbi);
}

const MDB_dbi& LMDBDatabase::underlying() const
{
    return _dbi;
}

LMDBStore::LMDBStore(LMDBEnvironment& environment, const std::string& name)
    : _environment(environment)
    , _name(name)
    , _database(_environment, LMDBTransaction(_environment, false), _name)
{}
LMDBSTORE::~LMDBStore() {}

void LMDBStore::put(size_t level, size_t index, std::vector<uint8_t>& data)
{
    LMDBTransaction transaction(_environment, false);
    size_t key = (1 << level) + index - 1;
    std::cout << "Key " << key << std::endl;

    MDB_val dbKey;
    dbKey.mv_size = sizeof(key);
    dbKey.mv_data = &key;

    MDB_val dbVal;
    dbVal.mv_size = data.size();
    dbVal.mv_data = static_cast<void*>(&data[0]);
    call_lmdb_func(mdb_put, transaction.underlying(), _database.underlying(), &dbKey, &dbVal, 0U);
}

bool LMDBStore::get(size_t level, size_t index, std::vector<uint8_t>& data) const
{
    LMDBTransaction transaction(_environment, false);
    size_t key = (1 << level) + index - 1;
    std::cout << "Key " << key << std::endl;

    MDB_val dbKey;
    dbKey.mv_size = sizeof(key);
    dbKey.mv_data = &key;

    MDB_val dbVal;
    if (!call_lmdb_func(mdb_get, transaction.underlying(), _database.underlying(), &dbKey, &dbVal)) {
        return false;
    }
    data.resize(dbVal.mv_size);
    std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
    return true;
}
} // namespace bb::crypto::merkle_tree