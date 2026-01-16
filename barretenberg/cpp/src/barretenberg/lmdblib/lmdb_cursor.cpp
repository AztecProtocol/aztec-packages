#include "barretenberg/lmdblib/lmdb_cursor.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include "lmdb.h"
#include <mutex>

namespace bb::lmdblib {
LMDBCursor::LMDBCursor(LMDBReadTransaction::SharedPtr tx, LMDBDatabase::SharedPtr db, uint64_t id)
    : _tx(tx)
    , _db(db)
    , _id(id)
{
    call_lmdb_func("mdb_cursor_open", mdb_cursor_open, tx->underlying(), db->underlying(), &_cursor);
}

LMDBCursor::~LMDBCursor()
{
    call_lmdb_func(mdb_cursor_close, _cursor);
}

MDB_cursor* LMDBCursor::underlying() const
{
    return _cursor;
}

const MDB_dbi& LMDBCursor::underlying_db() const
{
    return _db->underlying();
}

MDB_txn* LMDBCursor::underlying_tx() const
{
    return _tx->underlying();
}

uint64_t LMDBCursor::id() const
{
    return _id;
}

bool LMDBCursor::set_at_key(Key& key) const
{
    std::lock_guard<std::mutex> lock(_mtx);
    return lmdb_queries::set_at_key(*this, key);
}

bool LMDBCursor::set_at_key_gte(Key& key) const
{
    std::lock_guard<std::mutex> lock(_mtx);
    return lmdb_queries::set_at_key_gte(*this, key);
}

bool LMDBCursor::set_at_start() const
{
    std::lock_guard<std::mutex> lock(_mtx);
    return lmdb_queries::set_at_start(*this);
}

bool LMDBCursor::set_at_end() const
{
    std::lock_guard<std::mutex> lock(_mtx);
    return lmdb_queries::set_at_end(*this);
}

bool LMDBCursor::read_next(uint64_t numKeysToRead, KeyDupValuesVector& keyValuePairs) const
{
    std::lock_guard<std::mutex> lock(_mtx);
    if (_db->duplicate_keys_permitted()) {
        return lmdb_queries::read_next_dup(*this, keyValuePairs, numKeysToRead);
    }
    return lmdb_queries::read_next(*this, keyValuePairs, numKeysToRead);
}

bool LMDBCursor::read_prev(uint64_t numKeysToRead, KeyDupValuesVector& keyValuePairs) const
{
    std::lock_guard<std::mutex> lock(_mtx);
    if (_db->duplicate_keys_permitted()) {
        return lmdb_queries::read_prev_dup(*this, keyValuePairs, numKeysToRead);
    }
    return lmdb_queries::read_prev(*this, keyValuePairs, numKeysToRead);
}

bool LMDBCursor::count_until_next(const Key& key, uint64_t& count) const
{
    std::lock_guard<std::mutex> lock(_mtx);
    if (_db->duplicate_keys_permitted()) {
        return lmdb_queries::count_until_next_dup(*this, key, count);
    }
    return lmdb_queries::count_until_next(*this, key, count);
}

bool LMDBCursor::count_until_prev(const Key& key, uint64_t& count) const
{
    std::lock_guard<std::mutex> lock(_mtx);
    if (_db->duplicate_keys_permitted()) {
        return lmdb_queries::count_until_prev_dup(*this, key, count);
    }
    return lmdb_queries::count_until_prev(*this, key, count);
}

} // namespace bb::lmdblib
