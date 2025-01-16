#include "barretenberg/lmdblib/lmdb_cursor.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include "lmdb.h"

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

uint64_t LMDBCursor::id() const
{
    return _id;
}

bool LMDBCursor::set_at_key(Key& key) const
{
    return lmdb_queries::set_at_key(*this, key);
}

void LMDBCursor::read_next(uint64_t batchSize, KeyValuesVector& keyValuePairs) const
{
    lmdb_queries::read_next(*this, keyValuePairs, batchSize);
}

void LMDBCursor::read_prev(uint64_t batchSize, KeyValuesVector& keyValuePairs) const
{
    lmdb_queries::read_prev(*this, keyValuePairs, batchSize);
}

} // namespace bb::lmdblib