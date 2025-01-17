#pragma once

#include "barretenberg/lmdblib/lmdb_cursor.hpp"
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <unordered_map>
#include <vector>
namespace bb::lmdblib {

class LMDBStore {
  public:
    using Ptr = std::unique_ptr<LMDBStore>;
    using SharedPtr = std::shared_ptr<LMDBStore>;
    using WriteTransaction = LMDBWriteTransaction;
    using ReadTransaction = LMDBReadTransaction;
    using Database = LMDBDatabase;
    using Cursor = LMDBCursor;

    LMDBStore(std::string directory, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs);
    LMDBStore(const LMDBStore& other) = delete;
    LMDBStore(LMDBStore&& other) = delete;
    LMDBStore& operator=(const LMDBStore& other) = delete;
    LMDBStore& operator=(LMDBStore&& other) = delete;
    ~LMDBStore() = default;

    void open_database(const std::string& name, bool duplicateKeysPermitted = false);

    void put(KeyDupValuesVector& toWrite, KeyDupValuesVector& toDelete, const std::string& name);
    void get(KeysVector& keys, OptionalValuesVector& values, const std::string& name);

    ReadTransaction::Ptr create_read_transaction();
    ReadTransaction::SharedPtr create_shared_read_transaction();

    Cursor::Ptr create_cursor(ReadTransaction::SharedPtr tx, const std::string& dbName);

  private:
    std::string dbDirectory;
    mutable std::mutex writersMtx;
    LMDBEnvironment::SharedPtr environment;
    std::unordered_map<std::string, LMDBDatabase::SharedPtr> databases;

    void put(KeyDupValuesVector& toWrite, KeyDupValuesVector& toDelete, const LMDBDatabase& db);
    void get(KeysVector& keys, OptionalValuesVector& values, LMDBDatabase::SharedPtr db);
    Database::SharedPtr get_database(const std::string& name);
};
} // namespace bb::lmdblib