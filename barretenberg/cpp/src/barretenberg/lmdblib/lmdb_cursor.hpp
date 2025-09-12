#pragma once
#include "barretenberg/lmdblib/types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <memory>

namespace bb::lmdblib {
class LMDBReadTransaction;
class LMDBDatabase;
class LMDBCursor {
  public:
    using Ptr = std::unique_ptr<LMDBCursor>;
    using SharedPtr = std::shared_ptr<LMDBCursor>;

    LMDBCursor(std::shared_ptr<LMDBReadTransaction> tx, std::shared_ptr<LMDBDatabase> db, uint64_t id);
    LMDBCursor(const LMDBCursor& other) = delete;
    LMDBCursor(LMDBCursor&& other) = delete;
    LMDBCursor& operator=(const LMDBCursor& other) = delete;
    LMDBCursor& operator=(LMDBCursor&& other) = delete;
    ~LMDBCursor();

    MDB_cursor* underlying() const;
    const MDB_dbi& underlying_db() const;
    MDB_txn* underlying_tx() const;

    uint64_t id() const;

    bool set_at_key(Key& key) const;
    bool set_at_key_gte(Key& key) const;
    bool set_at_start() const;
    bool set_at_end() const;
    bool read_next(uint64_t numKeysToRead, KeyDupValuesVector& keyValuePairs) const;
    bool read_prev(uint64_t numKeysToRead, KeyDupValuesVector& keyValuePairs) const;
    bool count_until_next(const Key& key, uint64_t& count) const;
    bool count_until_prev(const Key& key, uint64_t& count) const;

  private:
    mutable std::mutex _mtx;
    std::shared_ptr<LMDBReadTransaction> _tx;
    std::shared_ptr<LMDBDatabase> _db;
    uint64_t _id;
    MDB_cursor* _cursor;
};
} // namespace bb::lmdblib
