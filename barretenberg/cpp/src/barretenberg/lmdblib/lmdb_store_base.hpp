#pragma once

#include "barretenberg/lmdblib/lmdb_db_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"

namespace bb::lmdblib {
class LMDBStoreBase {
  public:
    using ReadTransaction = LMDBReadTransaction;
    using WriteTransaction = LMDBWriteTransaction;
    using DBCreationTransaction = LMDBDatabaseCreationTransaction;
    LMDBStoreBase(std::string directory, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs);
    LMDBStoreBase(const LMDBStoreBase& other) = delete;
    LMDBStoreBase& operator=(const LMDBStoreBase& other) = delete;
    LMDBStoreBase(LMDBStoreBase&& other) noexcept = default;
    LMDBStoreBase& operator=(LMDBStoreBase&& other) noexcept = default;
    virtual ~LMDBStoreBase() = 0;
    ReadTransaction::Ptr create_read_transaction() const;
    ReadTransaction::SharedPtr create_shared_read_transaction() const;
    WriteTransaction::Ptr create_write_transaction() const;
    LMDBDatabaseCreationTransaction::Ptr create_db_transaction() const;
    void copy_store(const std::string& dstPath, bool compact);

  protected:
    std::string _dbDirectory;
    LMDBEnvironment::SharedPtr _environment;
};
} // namespace bb::lmdblib
