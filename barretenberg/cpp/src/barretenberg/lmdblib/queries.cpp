#include "barretenberg/lmdblib/queries.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <vector>

namespace bb::lmdblib::lmdb_queries {

void put_value(
    Key& key, Value& data, const LMDBDatabase& db, bb::lmdblib::LMDBWriteTransaction& tx, bool duplicatesPermitted)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    dbVal.mv_size = data.size();
    dbVal.mv_data = (void*)data.data();

    // The database has been configured to allow duplicate keys, but we don't permit duplicate key/value pairs
    // If we create a duplicate it will not insert it
    unsigned int flags = duplicatesPermitted ? MDB_NODUPDATA : 0U;
    call_lmdb_func("mdb_put", mdb_put, tx.underlying(), db.underlying(), &dbKey, &dbVal, flags);
}

void put_value(Key& key,
               const uint64_t& data,
               const LMDBDatabase& db,
               bb::lmdblib::LMDBWriteTransaction& tx,
               bool duplicatesPermitted)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    // use the serialise key method for serialising the index
    Value serialised = serialise_key(data);

    MDB_val dbVal;
    dbVal.mv_size = serialised.size();
    dbVal.mv_data = (void*)serialised.data();

    // The database has been configured to allow duplicate keys, but we don't permit duplicate key/value pairs
    // If we create a duplicate it will not insert it
    unsigned int flags = duplicatesPermitted ? MDB_NODUPDATA : 0U;
    call_lmdb_func("mdb_put", mdb_put, tx.underlying(), db.underlying(), &dbKey, &dbVal, flags);
}

void delete_value(Key& key, const LMDBDatabase& db, bb::lmdblib::LMDBWriteTransaction& tx)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val* dbVal = nullptr;
    int code = call_lmdb_func_with_return(mdb_del, tx.underlying(), db.underlying(), &dbKey, dbVal);
    if (code != MDB_SUCCESS && code != MDB_NOTFOUND) {
        throw_error("mdb_del", code);
    }
}

void delete_value(Key& key, Value& value, const LMDBDatabase& db, bb::lmdblib::LMDBWriteTransaction& tx)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    dbVal.mv_size = value.size();
    dbVal.mv_data = (void*)value.data();

    int code = call_lmdb_func_with_return(mdb_del, tx.underlying(), db.underlying(), &dbKey, &dbVal);
    if (code != MDB_SUCCESS && code != MDB_NOTFOUND) {
        throw_error("mdb_del", code);
    }
}

bool get_value(Key& key, Value& data, const LMDBDatabase& db, const bb::lmdblib::LMDBTransaction& tx)
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

bool get_value(Key& key, uint64_t& data, const LMDBDatabase& db, const bb::lmdblib::LMDBTransaction& tx)
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

bool set_at_key(const LMDBCursor& cursor, Key& key)
{
    MDB_val dbKey;
    dbKey.mv_size = key.size();
    dbKey.mv_data = (void*)key.data();

    MDB_val dbVal;
    int code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, MDB_SET);
    return code == MDB_SUCCESS;
}

void read_next(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numKeysToRead, MDB_cursor_op op)
{
    uint64_t numKeysRead = 0;
    MDB_val dbKey;
    MDB_val dbVal;
    int code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, MDB_GET_CURRENT);
    while (numKeysRead < numKeysToRead && code == MDB_SUCCESS) {
        // extract the key and value
        Value value;
        Key key;
        copy_to_vector(dbVal, value);
        copy_to_vector(dbKey, key);
        ValuesVector values;
        values.emplace_back(std::move(value));
        keyValues.emplace_back(std::move(key), std::move(values));
        ++numKeysRead;
        // move to the next key
        code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, op);
    }
}

void read_next_dup(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numKeysToRead, MDB_cursor_op op)
{
    uint64_t numKeysRead = 0;
    MDB_val dbKey;
    MDB_val dbVal;
    ValuesVector values;

    // ensure we are positioned at first data item of current key
    int code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, MDB_FIRST_DUP);
    while (numKeysRead < numKeysToRead && code == MDB_SUCCESS) {
        code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, MDB_GET_CURRENT);
        // extract the key and value
        Value value;
        Key key;
        copy_to_vector(dbVal, value);
        copy_to_vector(dbKey, key);
        values.push_back(value);

        // move to the next value at this key
        code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, MDB_NEXT_DUP);
        if (code == MDB_NOTFOUND) {
            // No more values at this key
            ++numKeysRead;
            keyValues.emplace_back(std::move(key), std::move(values));
            values = ValuesVector();
            // move to the next key
            code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, op);
            if (code == MDB_SUCCESS) {
                code = mdb_cursor_get(cursor.underlying(), &dbKey, &dbVal, MDB_FIRST_DUP);
            }
        }
    }
}

void read_next(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numKeysToRead)
{
    read_next(cursor, keyValues, numKeysToRead, MDB_NEXT);
}
void read_prev(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numKeysToRead)
{
    read_next(cursor, keyValues, numKeysToRead, MDB_PREV);
}

void read_next_dup(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numKeysToRead)
{
    read_next_dup(cursor, keyValues, numKeysToRead, MDB_NEXT_NODUP);
}
void read_prev_dup(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numKeysToRead)
{
    read_next_dup(cursor, keyValues, numKeysToRead, MDB_PREV_NODUP);
}
} // namespace bb::lmdblib::lmdb_queries