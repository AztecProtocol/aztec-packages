#pragma once
#include "barretenberg/crypto/merkle_tree/lmdb_store/functions.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include <cstring>
#include <vector>

namespace bb::crypto::merkle_tree {

class LMDBReadTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBReadTransaction>;

    LMDBReadTransaction(LMDBEnvironment& env, const LMDBDatabase& database);
    LMDBReadTransaction(const LMDBReadTransaction& other) = delete;
    LMDBReadTransaction(LMDBReadTransaction&& other) = delete;
    LMDBReadTransaction& operator=(const LMDBReadTransaction& other) = delete;
    LMDBReadTransaction& operator=(LMDBReadTransaction&& other) = delete;

    ~LMDBReadTransaction() override;

    template <typename T> bool get_value_or_previous(T& key, std::vector<uint8_t>& data) const;

    bool get_node(uint32_t level, index_t index, std::vector<uint8_t>& data) const;

    template <typename T> bool get_value_by_integer(T& key, std::vector<uint8_t>& data) const;

    bool get_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data) const;

    void abort() override;

  protected:
    const LMDBDatabase& _database;
};

template <typename T> bool LMDBReadTransaction::get_value_by_integer(T& key, std::vector<uint8_t>& data) const
{
    MDB_val dbKey;
    dbKey.mv_size = sizeof(T);
    dbKey.mv_data = (void*)&key;

    MDB_val dbVal;
    if (!call_lmdb_func(mdb_get, underlying(), _database.underlying(), &dbKey, &dbVal)) {
        return false;
    }
    data.resize(dbVal.mv_size);
    std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
    return true;
}

template <typename T> bool LMDBReadTransaction::get_value_or_previous(T& key, std::vector<uint8_t>& data) const
{
    T keyCopy = key;
    MDB_cursor* cursor = nullptr;
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, underlying(), _database.underlying(), &cursor);

    MDB_val dbKey;
    dbKey.mv_size = sizeof(T);
    dbKey.mv_data = (void*)&keyCopy;

    MDB_val dbVal;

    bool success = false;

    // Look for the key >= to that provided
    int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
    if (code == 0) {
        // we found the key, now determine if it is the exact key
        if (dbKey.mv_size == sizeof(T) && std::memcmp(dbKey.mv_data, &key, dbKey.mv_size) == 0) {
            // we have the exact key
            data.resize(dbVal.mv_size);
            std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
            success = true;
        } else {
            // We have a key of the same size but larger value OR a larger size
            // either way we now need to find the previous key
            code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);
            if (code == 0) {
                // We have found a previous key. It could be of the same size but smaller value, or smaller size which
                // is equal to not found
                if (dbKey.mv_size != sizeof(T)) {
                    // There is no previous key, do nothing
                } else {
                    data.resize(dbVal.mv_size);
                    std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
                    std::memcpy(&key, dbKey.mv_data, dbKey.mv_size);
                    success = true;
                }
            } else if (code == MDB_NOTFOUND) {
                // There is no previous key, do nothing
            } else {
                ThrowError("get_value_or_previous::mdb_cursor_get", code);
            }
        }
    } else if (code == MDB_NOTFOUND) {
        // The key was not found, use the last key in the db
        code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);
        if (code == 0) {
            // We found the last key, but we need to ensure it is the same size
            if (dbKey.mv_size != sizeof(T)) {
                // The key is not the same size, same as not found, do nothing
            } else {
                data.resize(dbVal.mv_size);
                std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
                std::memcpy(&key, dbKey.mv_data, dbKey.mv_size);
                success = true;
            }
        } else if (code == MDB_NOTFOUND) {
            // DB is empty?
        } else {
            ThrowError("get_value_or_previous::mdb_cursor_get", code);
        }
    } else {
        ThrowError("get_value_or_previous::mdb_cursor_get", code);
    }
    call_lmdb_func(mdb_cursor_close, cursor);
    return success;
}
} // namespace bb::crypto::merkle_tree