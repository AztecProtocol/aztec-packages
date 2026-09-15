#pragma once
#include "lmdblib/lmdb_transaction.hpp"

namespace azteclabs::lmdblib {

/*
 * RAII wrapper to construct a transaction for the purpose of creating/opening a database
 */
class LMDBDatabaseCreationTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBDatabaseCreationTransaction>;

    LMDBDatabaseCreationTransaction(LMDBEnvironment::SharedPtr env);
    LMDBDatabaseCreationTransaction(const LMDBDatabaseCreationTransaction& other) = delete;
    LMDBDatabaseCreationTransaction(LMDBDatabaseCreationTransaction&& other) = delete;
    LMDBDatabaseCreationTransaction& operator=(const LMDBDatabaseCreationTransaction& other) = delete;
    LMDBDatabaseCreationTransaction& operator=(LMDBDatabaseCreationTransaction&& other) = delete;

    ~LMDBDatabaseCreationTransaction() override;
    void commit();
    void try_abort();
};

} // namespace azteclabs::lmdblib