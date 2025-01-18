#pragma once
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <memory>

namespace bb::lmdblib {
class LMDBReadTransaction;
class LMDBCursor {
  public:
    using Ptr = std::unique_ptr<LMDBCursor>;
    using SharedPtr = std::shared_ptr<LMDBCursor>;

    LMDBCursor(std::shared_ptr<LMDBReadTransaction> tx, LMDBDatabase::SharedPtr db, uint64_t id);
    LMDBCursor(const LMDBCursor& other) = delete;
    LMDBCursor(LMDBCursor&& other) = delete;
    LMDBCursor& operator=(const LMDBCursor& other) = delete;
    LMDBCursor& operator=(LMDBCursor&& other) = delete;
    ~LMDBCursor();

    MDB_cursor* underlying() const;

    uint64_t id() const;

    bool set_at_key(Key& key) const;
    void read_next(uint64_t numKeysToRead, KeyDupValuesVector& keyValuePairs) const;
    void read_prev(uint64_t numKeysToRead, KeyDupValuesVector& keyValuePairs) const;

  private:
    std::shared_ptr<LMDBReadTransaction> _tx;
    LMDBDatabase::SharedPtr _db;
    uint64_t _id;
    MDB_cursor* _cursor;
};
} // namespace bb::lmdblib