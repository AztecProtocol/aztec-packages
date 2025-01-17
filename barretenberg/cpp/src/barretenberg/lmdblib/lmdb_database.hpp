#pragma once
#include "barretenberg/lmdblib/lmdb_environment.hpp"

namespace bb::lmdblib {

class LMDBDatabaseCreationTransaction;
/**
 * RAII wrapper atound the opening and closing of an LMDB database
 * Contains a reference to its LMDB environment
 */
class LMDBDatabase {
  public:
    using Ptr = std::unique_ptr<LMDBDatabase>;
    using SharedPtr = std::shared_ptr<LMDBDatabase>;

    LMDBDatabase(LMDBEnvironment::SharedPtr env,
                 const LMDBDatabaseCreationTransaction& transaction,
                 const std::string& name,
                 bool integerKeys = false,
                 bool reverseKeys = false,
                 bool duplicateKeysPermitted = false,
                 MDB_cmp_func* cmp = nullptr);

    LMDBDatabase(const LMDBDatabase& other) = delete;
    LMDBDatabase(LMDBDatabase&& other) = delete;
    LMDBDatabase& operator=(const LMDBDatabase& other) = delete;
    LMDBDatabase& operator=(LMDBDatabase&& other) = delete;

    ~LMDBDatabase();

    const MDB_dbi& underlying() const;
    const std::string& name() const;
    bool duplicate_keys_permitted() const;

  private:
    std::string dbName;
    bool duplicateKeysPermitted;
    MDB_dbi _dbi;
    LMDBEnvironment::SharedPtr environment;
};
} // namespace bb::lmdblib
