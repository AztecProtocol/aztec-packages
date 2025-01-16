#include "barretenberg/lmdblib/lmdb_db_transaction.hpp"

#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include <utility>

namespace bb::lmdblib {
LMDBDatabaseCreationTransaction::LMDBDatabaseCreationTransaction(LMDBEnvironment::SharedPtr env)
    : LMDBTransaction(std::move(env))
{}
LMDBDatabaseCreationTransaction::~LMDBDatabaseCreationTransaction()
{
    try_abort();
}
void LMDBDatabaseCreationTransaction::commit()
{
    if (state == TransactionState::ABORTED) {
        throw std::runtime_error("Tried to commit reverted transaction");
    }
    call_lmdb_func("mdb_txn_commit", mdb_txn_commit, _transaction);
    state = TransactionState::COMMITTED;
}

void LMDBDatabaseCreationTransaction::try_abort()
{
    if (state != TransactionState::OPEN) {
        return;
    }
    LMDBTransaction::abort();
}
} // namespace bb::lmdblib