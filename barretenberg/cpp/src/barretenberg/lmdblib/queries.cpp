#include "barretenberg/lmdblib/queries.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <vector>

namespace bb::lmdblib::lmdb_queries {

void put_value(std::vector<uint8_t>& key,
               std::vector<uint8_t>& data,
               const LMDBDatabase& db,
               bb::lmdblib::LMDBWriteTransaction& tx)
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
               const uint64_t& data,
               const LMDBDatabase& db,
               bb::lmdblib::LMDBWriteTransaction& tx)
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

void delete_value(std::vector<uint8_t>& key, const LMDBDatabase& db, bb::lmdblib::LMDBWriteTransaction& tx)
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
               const bb::lmdblib::LMDBTransaction& tx)
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
               uint64_t& data,
               const LMDBDatabase& db,
               const bb::lmdblib::LMDBTransaction& tx)
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

bool set_at_key(const LMDBCursor& cursor, std::vector<uint8_t>& key)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    int code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, MDB_SET);
    return code == 0;
}

void read_next(const LMDBCursor& cursor, KeyValuesVector& keyValues, uint64_t numToRead, MDB_cursor_op op)
{
    uint64_t numValuesRead = 0;
    MDB_val dbKey;
    MDB_val dbVal;
    int code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, MDB_GET_CURRENT);
    while (numValuesRead < numToRead && code == 0) {
        // extract the key and value
        Value value;
        Key key;
        copy_to_vector(dbVal, value);
        copy_to_vector(dbKey, key);
        keyValues.emplace_back(std::move(key), std::move(value));
        ++numValuesRead;
        // move to the next key
        code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, op);
    }
}

void read_next(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numToRead, MDB_cursor_op op)
{
    uint64_t numValuesRead = 0;
    MDB_val dbKey;
    MDB_val dbVal;

    // ensure we are positioned at first data item of current key
    int code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, MDB_FIRST_DUP);
    if (code != 0) {
        return;
    }

    while (numValuesRead < numToRead && code == 0) {
        // extract the key and value
        Value value;
        Key key;
        copy_to_vector(dbVal, value);
        copy_to_vector(dbKey, key);
        keyValues.emplace_back(std::move(key), std::move(value));
        ++numValuesRead;
        // move to the next key
        code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, op);
    }
}

void read_next(const LMDBCursor& cursor, KeyValuesVector& keyValues, uint64_t numToRead)
{
    read_next(cursor, keyValues, numToRead, MDB_NEXT);
}
void read_prev(const LMDBCursor& cursor, KeyValuesVector& keyValues, uint64_t numToRead)
{
    read_next(cursor, keyValues, numToRead, MDB_PREV);
}

void read_next(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numToRead);
void read_prev(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numToRead);
} // namespace bb::lmdblib::lmdb_queries