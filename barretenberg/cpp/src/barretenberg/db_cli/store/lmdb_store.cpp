#include "lmdb_store.hpp"

namespace bb::db_cli {

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

LMDBEnvironment::~LMDBEnvironment()
{
    call_lmdb_func(mdb_env_close, _mdbEnv);
}

MDB_env* LMDBEnvironment::underlying() const
{
    return _mdbEnv;
}

LMDBTransaction::LMDBTransaction(const LMDBEnvironment& env, const LMDBDatabase& database, bool readOnly)
    : _readOnly(readOnly)
    , _committed(false)
    , _database(database)
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

void LMDBTransaction::put(size_t level, size_t index, std::vector<uint8_t>& data)
{
    put(level, index, data, data.size());
}

void LMDBTransaction::put(size_t level, size_t start_index, std::vector<uint8_t>& data, size_t element_size)
{
    MDB_cursor* cursor;
    call_lmdb_func(mdb_cursor_open, underlying(), _database, &cursor);
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

LMDBDatabase::LMDBDatabase(const LMDBEnvironment& env, const LMDBTransaction& transaction, const std::string& name)
    : _environment(env)
{
    unsigned int flags = MDB_CREATE | MDB_INTEGERKEY;
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
LMDBStore::~LMDBStore() {}

bool LMDBStore::get(size_t level, size_t index, std::vector<uint8_t>& data) const
{
    LMDBTransaction transaction(_environment, true);
    size_t key = (1 << level) + index - 1;

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

std::unique_ptr<LMDBTransaction> LMDBStore::createWriteTransaction()
{
    return new LMDBTransaction(_environment, false);
}

} // namespace bb::db_cli