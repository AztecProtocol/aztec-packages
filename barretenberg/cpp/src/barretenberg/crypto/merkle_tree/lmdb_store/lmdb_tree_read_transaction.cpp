#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_read_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include <cstdint>

namespace bb::crypto::merkle_tree {
LMDBTreeReadTransaction::LMDBTreeReadTransaction(LMDBEnvironment::SharedPtr env)
    : LMDBTransaction(env, true)
{}

LMDBTreeReadTransaction::~LMDBTreeReadTransaction()
{
    abort();
}

void LMDBTreeReadTransaction::abort()
{
    LMDBTransaction::abort();
    _environment->release_reader();
}

bool LMDBTreeReadTransaction::get_value(std::vector<uint8_t>& key,
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
} // namespace bb::crypto::merkle_tree
