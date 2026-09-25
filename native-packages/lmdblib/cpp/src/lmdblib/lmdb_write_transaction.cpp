

#include "lmdblib/lmdb_write_transaction.hpp"

#include "lmdblib/lmdb_database.hpp"
#include "lmdblib/lmdb_environment.hpp"
#include "lmdblib/lmdb_helpers.hpp"
#include "lmdblib/queries.hpp"
#include "lmdb.h"
#include <utility>

namespace azteclabs::lmdblib {

LMDBWriteTransaction::LMDBWriteTransaction(LMDBEnvironment::SharedPtr env)
    : LMDBTransaction(std::move(env))
{}

LMDBWriteTransaction::~LMDBWriteTransaction()
{
    try_abort();
    _environment->release_writer();
}

void LMDBWriteTransaction::commit()
{
    if (state == TransactionState::ABORTED) {
        throw std::runtime_error("Tried to commit reverted transaction");
    }
    call_lmdb_func("mdb_txn_commit", mdb_txn_commit, _transaction);
    state = TransactionState::COMMITTED;
}

void LMDBWriteTransaction::try_abort()
{
    LMDBTransaction::abort();
}

void LMDBWriteTransaction::put_value(Key& key, Value& data, const LMDBDatabase& db)
{
    lmdb_queries::put_value(key, data, db, *this, db.duplicate_keys_permitted());
}

void LMDBWriteTransaction::put_value(Key& key, const uint64_t& data, const LMDBDatabase& db)
{
    lmdb_queries::put_value(key, data, db, *this, db.duplicate_keys_permitted());
}

void LMDBWriteTransaction::delete_value(Key& key, const LMDBDatabase& db)
{
    lmdb_queries::delete_value(key, db, *this);
}

void LMDBWriteTransaction::delete_value(Key& key, Value& value, const LMDBDatabase& db)
{
    lmdb_queries::delete_value(key, value, db, *this);
}
} // namespace azteclabs::lmdblib
