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
    _environment->release_writer();
}
void LMDBDatabaseCreationTransaction::commit()
{
    if (state != TransactionState::OPEN) {
        throw std::runtime_error("Tried to commit completed transaction");
    }
    int code = call_lmdb_func_with_return(mdb_txn_commit, _transaction);
    if (code != MDB_SUCCESS) {
        state = TransactionState::ABORTED;
        throw_error("mdb_txn_commit", code);
    }
    state = TransactionState::COMMITTED;
}

void LMDBDatabaseCreationTransaction::try_abort()
{
    LMDBTransaction::abort();
}
} // namespace bb::lmdblib
