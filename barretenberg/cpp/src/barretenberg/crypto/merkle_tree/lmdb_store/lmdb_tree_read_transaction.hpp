#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include <cstdint>
#include <cstring>
#include <functional>
#include <vector>

namespace bb::crypto::merkle_tree {

/**
 * RAII wrapper around a read transaction.
 * Contains various methods for retrieving values by their keys.
 * Aborts the transaction upon object destruction.
 */
class LMDBTreeReadTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBTreeReadTransaction>;

    LMDBTreeReadTransaction(LMDBEnvironment::SharedPtr env);
    LMDBTreeReadTransaction(const LMDBTreeReadTransaction& other) = delete;
    LMDBTreeReadTransaction(LMDBTreeReadTransaction&& other) = delete;
    LMDBTreeReadTransaction& operator=(const LMDBTreeReadTransaction& other) = delete;
    LMDBTreeReadTransaction& operator=(LMDBTreeReadTransaction&& other) = delete;

    ~LMDBTreeReadTransaction() override;

    template <typename T>
    bool get_value_or_previous(T& key,
                               std::vector<uint8_t>& data,
                               const LMDBDatabase& db,
                               const std::function<bool(const std::vector<uint8_t>&)>& is_valid) const;

    template <typename T> bool get_value_or_previous(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    template <typename T> bool get_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    bool get_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    void abort() override;
};

template <typename T>
bool LMDBTreeReadTransaction::get_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    return get_value(keyBuffer, data, db);
}

template <typename T>
bool LMDBTreeReadTransaction::get_value_or_previous(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    uint32_t keySize = static_cast<uint32_t>(keyBuffer.size());
    MDB_cursor* cursor = nullptr;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, underlying(), db.underlying(), &cursor);

    MDB_val dbKey;
    dbKey.mv_size = keySize;
    dbKey.mv_data = (void*)keyBuffer.data();

    MDB_val dbVal;

    bool success = false;

    // Look for the key >= to that provided
    int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
    if (code == 0) {
        // we found the key, now determine if it is the exact key
        std::vector<uint8_t> temp = mdb_val_to_vector(dbKey);
        if (keyBuffer == temp) {
            // we have the exact key
            copy_to_vector(dbVal, data);
            success = true;
        } else {
            // We have a key of the same size but larger value OR a larger size
            // either way we now need to find the previous key
            code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);
            if (code == 0) {
                // We have found a previous key. It could be of the same size but smaller value, or smaller size which
                // is equal to not found
                if (dbKey.mv_size != keySize) {
                    // There is no previous key, do nothing
                } else {
                    copy_to_vector(dbVal, data);
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
                copy_to_vector(dbVal, data);
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
    call_lmdb_func(mdb_cursor_close, cursor);
    return success;
}

template <typename T>
bool LMDBTreeReadTransaction::get_value_or_previous(
    T& key,
    std::vector<uint8_t>& data,
    const LMDBDatabase& db,
    const std::function<bool(const std::vector<uint8_t>&)>& is_valid) const
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    uint32_t keySize = static_cast<uint32_t>(keyBuffer.size());
    MDB_cursor* cursor = nullptr;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, underlying(), db.underlying(), &cursor);

    MDB_val dbKey;
    dbKey.mv_size = keySize;
    dbKey.mv_data = (void*)keyBuffer.data();

    MDB_val dbVal;

    bool success = false;

    // Look for the key >= to that provided
    int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
    if (code == 0) {
        bool lower = false;
        while (!success) {
            // We found the key, now determine if it is the exact key
            std::vector<uint8_t> temp = mdb_val_to_vector(dbKey);
            if (keyBuffer == temp || lower) {
                // We have the exact key, we need to determine if it is valid
                copy_to_vector(dbVal, data);
                if (is_valid(data)) {
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
                copy_to_vector(dbVal, data);
                if (is_valid(data)) {
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
    call_lmdb_func(mdb_cursor_close, cursor);
    return success;
}
} // namespace bb::crypto::merkle_tree