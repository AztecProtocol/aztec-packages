#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_db_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "lmdb.h"
#include <utility>

namespace bb::lmdblib {
LMDBDatabase::LMDBDatabase(LMDBEnvironment::SharedPtr env,
                           const LMDBDatabaseCreationTransaction& transaction,
                           const std::string& name,
                           bool integerKeys,
                           bool reverseKeys,
                           bool duplicateKeysPermitted,
                           MDB_cmp_func* cmp)
    : dbName(name)
    , duplicateKeysPermitted(duplicateKeysPermitted)
    , environment(std::move(env))
{
    unsigned int flags = MDB_CREATE;
    if (integerKeys) {
        flags |= MDB_INTEGERKEY;
    }
    if (reverseKeys) {
        flags |= MDB_REVERSEKEY;
    }
    if (duplicateKeysPermitted) {
        flags |= MDB_DUPSORT;
    }
    call_lmdb_func("mdb_dbi_open", mdb_dbi_open, transaction.underlying(), name.c_str(), flags, &_dbi);
    if (cmp != nullptr) {
        call_lmdb_func("mdb_set_compare", mdb_set_compare, transaction.underlying(), _dbi, cmp);
    }
}

LMDBDatabase::~LMDBDatabase()
{
    call_lmdb_func(mdb_dbi_close, environment->underlying(), _dbi);
}

const MDB_dbi& LMDBDatabase::underlying() const
{
    return _dbi;
}

const std::string& LMDBDatabase::name() const
{
    return dbName;
}

bool LMDBDatabase::duplicate_keys_permitted() const
{
    return duplicateKeysPermitted;
}

DBStats LMDBDatabase::get_stats(LMDBReadTransaction& tx)
{
    MDB_stat stat;
    call_lmdb_func(mdb_stat, tx.underlying(), underlying(), &stat);
    return DBStats(name(), stat);
}

} // namespace bb::lmdblib