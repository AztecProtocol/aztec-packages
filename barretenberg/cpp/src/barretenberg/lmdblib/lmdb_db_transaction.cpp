#include "barretenberg/lmdblib/lmdb_db_transaction.hpp"

#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include <utility>

namespace bb::lmdblib {
LMDBDatabaseCreationTransaction::LMDBDatabaseCreationTransaction(LMDBEnvironment::SharedPtr env)
    : LMDBTransaction(std::move(env))
{}
void LMDBDatabaseCreationTransaction::commit() const
{
    call_lmdb_func("mdb_txn_commit", mdb_txn_commit, _transaction);
}
} // namespace bb::lmdblib