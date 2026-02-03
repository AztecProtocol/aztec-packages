#pragma once

#include "barretenberg/lmdblib/lmdb_cursor.hpp"
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_store_base.hpp"
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

/**
 * Implements a basic lmdb store. Consisting of an environment, any number of databases, transactions and cursors
 */

class LMDBStore : public LMDBStoreBase {
  public:
    using Ptr = std::unique_ptr<LMDBStore>;
    using SharedPtr = std::shared_ptr<LMDBStore>;
    using WriteTransaction = LMDBWriteTransaction;
    using ReadTransaction = LMDBReadTransaction;
    using Database = LMDBDatabase;
    using Cursor = LMDBCursor;

    struct PutData {
        KeyDupValuesVector toWrite;
        KeyOptionalValuesVector toDelete;
        std::string name;
    };

    LMDBStore(std::string directory, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs);
    LMDBStore(const LMDBStore& other) = delete;
    LMDBStore(LMDBStore&& other) = delete;
    LMDBStore& operator=(const LMDBStore& other) = delete;
    LMDBStore& operator=(LMDBStore&& other) = delete;
    ~LMDBStore() override = default;

    void open_database(const std::string& name, bool duplicateKeysPermitted = false);
    void close_database(const std::string& name);

    void put(std::vector<PutData>& data);
    void get(KeysVector& keys, OptionalValuesVector& values, const std::string& name);

    Cursor::Ptr create_cursor(ReadTransaction::SharedPtr tx, const std::string& dbName);

    std::pair<uint64_t, uint64_t> get_stats(std::vector<DBStats>& stats) const;

  private:
    // mutex to protect the databases map
    mutable std::mutex databasesMutex;
    std::unordered_map<std::string, LMDBDatabase::SharedPtr> databases;

    void put(KeyDupValuesVector& toWrite,
             KeyOptionalValuesVector& toDelete,
             const LMDBDatabase& db,
             LMDBWriteTransaction& tx);
    void get(KeysVector& keys, OptionalValuesVector& values, LMDBDatabase::SharedPtr db);
    // Returns the database of the given name
    Database::SharedPtr get_database(const std::string& name);
    // Returns all databases
    std::vector<Database::SharedPtr> get_databases() const;
    // Returns database corresponding to the requested put operations
    // Databases are returned in the order of the puts
    // Throws if any of the databases are not found
    std::vector<Database::SharedPtr> get_databases(const std::vector<PutData>& puts) const;
};
} // namespace bb::lmdblib
