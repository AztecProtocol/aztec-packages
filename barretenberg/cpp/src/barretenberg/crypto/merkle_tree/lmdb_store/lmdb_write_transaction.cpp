

#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_write_transaction.hpp"

namespace bb::crypto::merkle_tree {

LMDBWriteTransaction::LMDBWriteTransaction(LMDBEnvironment& env, const LMDBDatabase& database)
    : LMDBTransaction(env)
    , _database(database)
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

void LMDBWriteTransaction::put_node(uint32_t level, index_t index, std::vector<uint8_t>& data)
{
    NodeKeyType key = ((static_cast<NodeKeyType>(1) << level) + static_cast<NodeKeyType>(index)) - 1;
    put_value_by_integer(key, data);
}

void LMDBWriteTransaction::put_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    dbVal.mv_size = data.size();
    dbVal.mv_data = (void*)data.data();
    call_lmdb_func("mdb_put", mdb_put, underlying(), _database.underlying(), &dbKey, &dbVal, 0U);
}
} // namespace bb::crypto::merkle_tree
