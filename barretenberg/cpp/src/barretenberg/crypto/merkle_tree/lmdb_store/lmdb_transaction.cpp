#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_transaction.hpp"

#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include <utility>

namespace bb::crypto::merkle_tree {
LMDBTransaction::LMDBTransaction(std::shared_ptr<LMDBEnvironment> env, bool readOnly)
    : _environment(std::move(env))
    , state(TransactionState::OPEN)
{
    MDB_txn* p = nullptr;
    call_lmdb_func(
        "mdb_txn_begin", mdb_txn_begin, _environment->underlying(), p, readOnly ? MDB_RDONLY : 0U, &_transaction);
}

LMDBTransaction::~LMDBTransaction() = default;

MDB_txn* LMDBTransaction::underlying() const
{
    return _transaction;
}

void LMDBTransaction::abort()
{
    if (state != TransactionState::OPEN) {
        return;
    }
    call_lmdb_func(mdb_txn_abort, _transaction);
    state = TransactionState::ABORTED;
}

bool LMDBTransaction::get_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const
{
    return lmdb_queries::get_value(key, data, db, *this);
}

bool LMDBTransaction::get_value(std::vector<uint8_t>& key, index_t& data, const LMDBDatabase& db) const
{
    return lmdb_queries::get_value(key, data, db, *this);
}
} // namespace bb::crypto::merkle_tree