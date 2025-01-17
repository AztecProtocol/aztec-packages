#pragma once

#include "barretenberg/lmdblib/lmdb_cursor.hpp"
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <functional>
#include <vector>

namespace bb::lmdblib {

class LMDBTransaction;
class LMDBWriteTransaction;

namespace lmdb_queries {

template <typename TKey, typename TValue, typename TxType>
bool get_value_or_previous(TKey& key, TValue& data, const LMDBDatabase& db, const TxType& tx)
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    uint32_t keySize = static_cast<uint32_t>(keyBuffer.size());
    MDB_cursor* cursor = nullptr;
    bool success = false;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, tx.underlying(), db.underlying(), &cursor);

    try {
        MDB_val dbKey;
        dbKey.mv_size = keySize;
        dbKey.mv_data = (void*)keyBuffer.data();
        MDB_val dbVal;

        // Look for the key >= to that provided
        int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
        if (code == 0) {
            // we found the key, now determine if it is the exact key
            std::vector<uint8_t> temp = mdb_val_to_vector(dbKey);
            if (keyBuffer == temp) {
                // we have the exact key
                deserialise_key(dbVal.mv_data, data);
                success = true;
            } else {
                // We have a key of the same size but larger value OR a larger size
                // either way we now need to find the previous key
                code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);
                if (code == 0) {
                    // We have found a previous key. It could be of the same size but smaller value, or smaller size
                    // which is equal to not found
                    if (dbKey.mv_size != keySize) {
                        // There is no previous key, do nothing
                    } else {
                        deserialise_key(dbVal.mv_data, data);
                        deserialise_key(dbKey.mv_data, key);
                        success = true;
                    }
                } else if (code == MDB_NOTFOUND) {
                    // There is no previous key, do nothing
                } else {
                    throw_error("get_value_or_previous::mdb_cursor_get", code);
                }
            }
        } else if (code == MDB_NOTFOUND) {
            // The key was not found, use the last key in the db
            code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);
            if (code == 0) {
                // We found the last key, but we need to ensure it is the same size
                if (dbKey.mv_size != keySize) {
                    // The key is not the same size, same as not found, do nothing
                } else {
                    deserialise_key(dbVal.mv_data, data);
                    deserialise_key(dbKey.mv_data, key);
                    success = true;
                }
            } else if (code == MDB_NOTFOUND) {
                // DB is empty?
            } else {
                throw_error("get_value_or_previous::mdb_cursor_get", code);
            }
        } else {
            throw_error("get_value_or_previous::mdb_cursor_get", code);
        }
    } catch (std::exception& e) {
        call_lmdb_func(mdb_cursor_close, cursor);
        throw;
    }
    call_lmdb_func(mdb_cursor_close, cursor);
    return success;
}

template <typename TKey, typename TValue, typename TxType>
bool get_value_or_previous(TKey& key,
                           TValue& data,
                           const LMDBDatabase& db,
                           const std::function<bool(const MDB_val&)>& is_valid,
                           const TxType& tx)
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    uint32_t keySize = static_cast<uint32_t>(keyBuffer.size());
    MDB_cursor* cursor = nullptr;
    bool success = false;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, tx.underlying(), db.underlying(), &cursor);

    try {
        MDB_val dbKey;
        dbKey.mv_size = keySize;
        dbKey.mv_data = (void*)keyBuffer.data();

        MDB_val dbVal;
        // Look for the key >= to that provided
        int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
        if (code == 0) {
            bool lower = false;
            while (!success) {
                // We found the key, now determine if it is the exact key
                std::vector<uint8_t> temp = mdb_val_to_vector(dbKey);
                if (keyBuffer == temp || lower) {
                    // We have the exact key, we need to determine if it is valid
                    if (is_valid(dbVal)) {
                        deserialise_key(dbVal.mv_data, data);
                        deserialise_key(dbKey.mv_data, key);
                        success = true;
                        // It's valid
                        break;
                    }
                } else if (dbKey.mv_size < keySize) {
                    // We have a key of a smaller size, this means what we are looking for doesn't exist
                    break;
                }
                // At this point one of the following is true
                // 1. We have a key of the same size but larger value
                // 2. A larger size
                // 3. The exact key but it is not valid
                // either way we now need to find the previous key
                code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);
                if (code == 0) {
                    // Success, go round the loop again, this time we will definitely have a lower key
                    lower = true;
                } else if (code == MDB_NOTFOUND) {
                    // There is no previous key, do nothing
                    break;
                } else {
                    throw_error("get_value_or_previous::mdb_cursor_get", code);
                }
            }
        } else if (code == MDB_NOTFOUND) {
            while (!success) {
                // The key was not found, walk down from the end of the db
                code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);
                if (code == 0) {
                    // We found the last key, but we need to ensure it is the same size
                    if (dbKey.mv_size != keySize) {
                        // The key is not the same size, same as not found, exit
                        break;
                    }
                    if (is_valid(dbVal)) {
                        deserialise_key(dbVal.mv_data, data);
                        deserialise_key(dbKey.mv_data, key);
                        success = true;
                        // It's valid
                        break;
                    }
                    // we will need to go round again
                } else if (code == MDB_NOTFOUND) {
                    // DB is empty?
                } else {
                    throw_error("get_value_or_previous::mdb_cursor_get", code);
                }
            }
        } else {
            throw_error("get_value_or_previous::mdb_cursor_get", code);
        }
    } catch (std::exception& e) {
        call_lmdb_func(mdb_cursor_close, cursor);
        throw;
    }

    call_lmdb_func(mdb_cursor_close, cursor);
    return success;
}

template <typename TKey, typename TxType>
bool get_value_or_greater(TKey& key, Value& data, const LMDBDatabase& db, const TxType& tx)
{
    bool success = false;
    Key keyBuffer = serialise_key(key);
    uint32_t keySize = static_cast<uint32_t>(keyBuffer.size());
    MDB_cursor* cursor = nullptr;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, tx.underlying(), db.underlying(), &cursor);

    try {
        MDB_val dbKey;
        dbKey.mv_size = keySize;
        dbKey.mv_data = (void*)keyBuffer.data();

        MDB_val dbVal;
        // Look for the key >= to that provided
        int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);

        if (code == 0) {
            // found a key >= our key. if it is not the same size, it must be out of range for what we are looking
            // for, this means no more data available
            if (keySize == dbKey.mv_size) {
                // key is the same size, so this contains the data we are looking for
                copy_to_vector(dbVal, data);
                success = true;
            }
        } else if (code == MDB_NOTFOUND) {
            // no key greater than or equal, nothing to extract
        } else {
            throw_error("get_value_or_greater::mdb_cursor_get", code);
        }
    } catch (std::exception& e) {
        call_lmdb_func(mdb_cursor_close, cursor);
        throw;
    }
    call_lmdb_func(mdb_cursor_close, cursor);
    return success;
}

template <typename TKey, typename TxType>
void get_all_values_greater_or_equal_key(const TKey& key, ValuesVector& data, const LMDBDatabase& db, const TxType& tx)
{
    Key keyBuffer = serialise_key(key);
    uint32_t keySize = static_cast<uint32_t>(keyBuffer.size());
    MDB_cursor* cursor = nullptr;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, tx.underlying(), db.underlying(), &cursor);

    try {
        MDB_val dbKey;
        dbKey.mv_size = keySize;
        dbKey.mv_data = (void*)keyBuffer.data();

        MDB_val dbVal;
        // Look for the key >= to that provided
        int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
        while (true) {
            if (code == 0) {
                // found a key >= our key. if it is not the same size, it must be out of range for what we are looking
                // for, this means no more data available
                if (keySize != dbKey.mv_size) {
                    break;
                }
                // this is data that we need to extract
                Value temp;
                copy_to_vector(dbVal, temp);
                data.emplace_back(temp);

                // move to the next key
                code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_NEXT);
            } else if (code == MDB_NOTFOUND) {
                // no more data to extract
                break;
            } else {
                throw_error("get_all_values_greater_or_equal_key::mdb_cursor_get", code);
            }
        }
    } catch (std::exception& e) {
        call_lmdb_func(mdb_cursor_close, cursor);
        throw;
    }
    call_lmdb_func(mdb_cursor_close, cursor);
}

template <typename TKey, typename TxType>
void delete_all_values_greater_or_equal_key(const TKey& key, const LMDBDatabase& db, const TxType& tx)
{
    Key keyBuffer = serialise_key(key);
    uint32_t keySize = static_cast<uint32_t>(keyBuffer.size());
    MDB_cursor* cursor = nullptr;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, tx.underlying(), db.underlying(), &cursor);

    try {
        MDB_val dbKey;
        dbKey.mv_size = keySize;
        dbKey.mv_data = (void*)keyBuffer.data();

        MDB_val dbVal;
        // Look for the key >= to that provided
        int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
        while (true) {
            if (code == 0) {
                // found a key >= our key. if it is not the same size, it must be out of range for what we are looking
                // for, this means no more data available
                if (keySize != dbKey.mv_size) {
                    break;
                }
                // this is data that we need to delete
                code = mdb_cursor_del(cursor, 0);

                if (code != 0) {
                    throw_error("delete_all_values_greater_or_equal_key::mdb_cursor_del", code);
                }

                // move to the next key
                code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_NEXT);
            } else if (code == MDB_NOTFOUND) {
                // no more data to extract
                break;
            } else {
                throw_error("delete_all_values_greater_or_equal_key::mdb_cursor_get", code);
            }
        }
    } catch (std::exception& e) {
        call_lmdb_func(mdb_cursor_close, cursor);
        throw;
    }
    call_lmdb_func(mdb_cursor_close, cursor);
}

template <typename TKey, typename TxType>
void get_all_values_lesser_or_equal_key(const TKey& key, ValuesVector& data, const LMDBDatabase& db, const TxType& tx)
{
    Key keyBuffer = serialise_key(key);
    uint32_t keySize = static_cast<uint32_t>(keyBuffer.size());
    MDB_cursor* cursor = nullptr;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, tx.underlying(), db.underlying(), &cursor);

    try {
        MDB_val dbKey;
        dbKey.mv_size = keySize;
        dbKey.mv_data = (void*)keyBuffer.data();

        MDB_val dbVal;
        // Look for the key >= to that provided
        int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
        if (code == 0) {
            // we found the key, now determine if it is the exact key
            Key temp = mdb_val_to_vector(dbKey);
            if (keyBuffer == temp) {
                // we have the exact key, copy it's data
                Value temp;
                copy_to_vector(dbVal, temp);
                data.push_back(temp);
            } else {
                // not the exact key, either the same size but greater value or larger key size
                // either way we just need to move down
            }
        } else if (code == MDB_NOTFOUND) {
            // key not found. no key of greater size or same size and greater value, just move down
        } else {
            throw_error("get_all_values_lesser_or_equal_key::mdb_cursor_get", code);
        }

        // we now iterate down the keys until we run out
        while (true) {
            code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);

            if (code == 0) {
                // we have found a previous key, if it is a different size then we have reached the end of the data
                if (dbKey.mv_size != keySize) {
                    break;
                }
                // the same size, grab the value and go round again
                Value temp;
                copy_to_vector(dbVal, temp);
                data.push_back(temp);

            } else if (MDB_NOTFOUND) {
                // we have reached the end of the db
                break;
            } else {
                throw_error("get_all_values_lesser_or_equal_key::mdb_cursor_get", code);
            }
        }
    } catch (std::exception& e) {
        call_lmdb_func(mdb_cursor_close, cursor);
        throw;
    }
    call_lmdb_func(mdb_cursor_close, cursor);
}

template <typename TKey, typename TxType>
void delete_all_values_lesser_or_equal_key(const TKey& key, const LMDBDatabase& db, const TxType& tx)
{
    Key keyBuffer = serialise_key(key);
    uint32_t keySize = static_cast<uint32_t>(keyBuffer.size());
    MDB_cursor* cursor = nullptr;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, tx.underlying(), db.underlying(), &cursor);

    try {
        MDB_val dbKey;
        dbKey.mv_size = keySize;
        dbKey.mv_data = (void*)keyBuffer.data();

        MDB_val dbVal;
        // Look for the key >= to that provided
        int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
        if (code == 0) {
            // we found the key, now determine if it is the exact key
            Key temp = mdb_val_to_vector(dbKey);
            if (keyBuffer == temp) {
                // we have the exact key, delete it's data
                code = mdb_cursor_del(cursor, 0);

                if (code != 0) {
                    throw_error("delete_all_values_lesser_or_equal_key::mdb_cursor_del", code);
                }
            } else {
                // not the exact key, either the same size but greater value or larger key size
                // either way we just need to move down
            }
        } else if (code == MDB_NOTFOUND) {
            // key not found. no key of greater size or same size and greater value, just move down
        } else {
            throw_error("get_all_values_lesser_or_equal_key::mdb_cursor_get", code);
        }

        // we now iterate down the keys until we run out
        while (true) {
            code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);

            if (code == 0) {
                // we have found a previous key, if it is a different size then we have reached the end of the data
                if (dbKey.mv_size != keySize) {
                    break;
                }
                // we have the exact key, delete it's data
                code = mdb_cursor_del(cursor, 0);

                if (code != 0) {
                    throw_error("delete_all_values_lesser_or_equal_key::mdb_cursor_del", code);
                }

            } else if (MDB_NOTFOUND) {
                // we have reached the end of the db
                break;
            } else {
                throw_error("get_all_values_lesser_or_equal_key::mdb_cursor_get", code);
            }
        }
    } catch (std::exception& e) {
        call_lmdb_func(mdb_cursor_close, cursor);
        throw;
    }
    call_lmdb_func(mdb_cursor_close, cursor);
}

void put_value(Key& key, Value& data, const LMDBDatabase& db, LMDBWriteTransaction& tx);

void put_value(Key& key, const uint64_t& data, const LMDBDatabase& db, LMDBWriteTransaction& tx);

void delete_value(Key& key, const LMDBDatabase& db, LMDBWriteTransaction& tx);

bool get_value(Key& key, Value& data, const LMDBDatabase& db, const LMDBTransaction& tx);

bool get_value(Key& key, uint64_t& data, const LMDBDatabase& db, const LMDBTransaction& tx);

bool set_at_key(const LMDBCursor& cursor, Key& key);

void read_next(const LMDBCursor& cursor, KeyValuesVector& keyValues, uint64_t numToRead);
void read_prev(const LMDBCursor& cursor, KeyValuesVector& keyValues, uint64_t numToRead);

void read_next(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numToRead);
void read_prev(const LMDBCursor& cursor, KeyDupValuesVector& keyValues, uint64_t numToRead);
} // namespace lmdb_queries
} // namespace bb::lmdblib
