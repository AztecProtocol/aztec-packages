#include "barretenberg/crypto/merkle_tree/lmdb_store/queries.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_write_transaction.hpp"
#include <vector>

namespace bb::crypto::merkle_tree::lmdb_queries {

void put_value(std::vector<uint8_t>& key,
               std::vector<uint8_t>& data,
               const LMDBDatabase& db,
               bb::crypto::merkle_tree::LMDBTreeWriteTransaction& tx)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    dbVal.mv_size = data.size();
    dbVal.mv_data = (void*)data.data();
    call_lmdb_func("mdb_put", mdb_put, tx.underlying(), db.underlying(), &dbKey, &dbVal, 0U);
}

void put_value(std::vector<uint8_t>& key,
               const index_t& data,
               const LMDBDatabase& db,
               bb::crypto::merkle_tree::LMDBTreeWriteTransaction& tx)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    // use the serialise key method for serialising the index
    std::vector<uint8_t> serialised = serialise_key(data);

    MDB_val dbVal;
    dbVal.mv_size = serialised.size();
    dbVal.mv_data = (void*)serialised.data();
    call_lmdb_func("mdb_put", mdb_put, tx.underlying(), db.underlying(), &dbKey, &dbVal, 0U);
}

void delete_value(std::vector<uint8_t>& key,
                  const LMDBDatabase& db,
                  bb::crypto::merkle_tree::LMDBTreeWriteTransaction& tx)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val* dbVal = nullptr;
    int code = call_lmdb_func_with_return(mdb_del, tx.underlying(), db.underlying(), &dbKey, dbVal);
    if (code != 0 && code != MDB_NOTFOUND) {
        throw_error("mdb_del", code);
    }
}

bool get_value(std::vector<uint8_t>& key,
               std::vector<uint8_t>& data,
               const LMDBDatabase& db,
               const bb::crypto::merkle_tree::LMDBTransaction& tx)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    if (!call_lmdb_func(mdb_get, tx.underlying(), db.underlying(), &dbKey, &dbVal)) {
        return false;
    }
    copy_to_vector(dbVal, data);
    return true;
}

bool get_value(std::vector<uint8_t>& key,
               index_t& data,
               const LMDBDatabase& db,
               const bb::crypto::merkle_tree::LMDBTransaction& tx)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    if (!call_lmdb_func(mdb_get, tx.underlying(), db.underlying(), &dbKey, &dbVal)) {
        return false;
    }
    // use the deserialise key method for deserialising the index
    deserialise_key(dbVal.mv_data, data);
    return true;
}
} // namespace bb::crypto::merkle_tree::lmdb_queries