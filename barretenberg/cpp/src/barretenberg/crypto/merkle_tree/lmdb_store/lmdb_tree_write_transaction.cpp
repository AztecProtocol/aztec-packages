

#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_write_transaction.hpp"

#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
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

bool LMDBTreeWriteTransaction::get_value(std::vector<uint8_t>& key,
                                         std::vector<uint8_t>& data,
                                         const LMDBDatabase& db) const
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    if (!call_lmdb_func(mdb_get, underlying(), db.underlying(), &dbKey, &dbVal)) {
        return false;
    }
    copy_to_vector(dbVal, data);
    return true;
}

void LMDBTreeWriteTransaction::put_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    dbVal.mv_size = data.size();
    dbVal.mv_data = (void*)data.data();
    call_lmdb_func("mdb_put", mdb_put, underlying(), db.underlying(), &dbKey, &dbVal, 0U);
}

void LMDBTreeWriteTransaction::delete_value(std::vector<uint8_t>& key, const LMDBDatabase& db)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val* dbVal = nullptr;
    int code = call_lmdb_func_with_return(mdb_del, underlying(), db.underlying(), &dbKey, dbVal);
    if (code != 0 && code != MDB_NOTFOUND) {
        throw_error("mdb_del", code);
    }
}
} // namespace bb::crypto::merkle_tree
