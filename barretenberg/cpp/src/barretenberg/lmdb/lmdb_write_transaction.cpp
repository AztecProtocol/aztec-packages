

#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_write_transaction.hpp"

#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/queries.hpp"
#include "lmdb.h"
#include <utility>

namespace bb::crypto::merkle_tree {

LMDBTreeWriteTransaction::LMDBTreeWriteTransaction(LMDBEnvironment::SharedPtr env)
    : LMDBTransaction(std::move(env))
{}

LMDBTreeWriteTransaction::~LMDBTreeWriteTransaction()
{
    try_abort();
}

void LMDBTreeWriteTransaction::commit()
{
    if (state == TransactionState::ABORTED) {
        throw std::runtime_error("Tried to commit reverted transaction");
    }
    call_lmdb_func("mdb_txn_commit", mdb_txn_commit, _transaction);
    state = TransactionState::COMMITTED;
}

void LMDBTreeWriteTransaction::try_abort()
{
    if (state != TransactionState::OPEN) {
        return;
    }
    LMDBTransaction::abort();
}

void LMDBTreeWriteTransaction::put_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db)
{
    lmdb_queries::put_value(key, data, db, *this);
}

void LMDBTreeWriteTransaction::put_value(std::vector<uint8_t>& key, const index_t& data, const LMDBDatabase& db)
{
    lmdb_queries::put_value(key, data, db, *this);
}

void LMDBTreeWriteTransaction::delete_value(std::vector<uint8_t>& key, const LMDBDatabase& db)
{
    lmdb_queries::delete_value(key, db, *this);
}
} // namespace bb::crypto::merkle_tree
