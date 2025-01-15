

#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"

#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include "lmdb.h"
#include <utility>

namespace bb::lmdblib {

LMDBWriteTransaction::LMDBWriteTransaction(LMDBEnvironment::SharedPtr env)
    : LMDBTransaction(std::move(env))
{}

LMDBWriteTransaction::~LMDBWriteTransaction()
{
    try_abort();
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
    if (state != TransactionState::OPEN) {
        return;
    }
    LMDBTransaction::abort();
}

void LMDBWriteTransaction::put_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db)
{
    lmdb_queries::put_value(key, data, db, *this);
}

void LMDBWriteTransaction::put_value(std::vector<uint8_t>& key, const uint64_t& data, const LMDBDatabase& db)
{
    lmdb_queries::put_value(key, data, db, *this);
}

void LMDBWriteTransaction::delete_value(std::vector<uint8_t>& key, const LMDBDatabase& db)
{
    lmdb_queries::delete_value(key, db, *this);
}
} // namespace bb::lmdblib
