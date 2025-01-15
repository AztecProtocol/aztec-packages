#pragma once

#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include <memory>
namespace bb::lmdblib {
class LMDBStore {
  public:
    using Ptr = std::unique_ptr<LMDBStore>;
    using SharedPtr = std::shared_ptr<LMDBStore>;
    using WriteTransaction = LMDBWriteTransaction;
    using ReadTransaction = LMDBReadTransaction;

    LMDBStore(std::string directory, std::string name, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs);
    LMDBStore(const LMDBStore& other) = delete;
    LMDBStore(LMDBStore&& other) = delete;
    LMDBStore& operator=(const LMDBStore& other) = delete;
    LMDBStore& operator=(LMDBStore&& other) = delete;
    ~LMDBStore() = default;

    WriteTransaction::Ptr create_write_transaction() const;
    ReadTransaction::Ptr create_read_transaction();

  private:
    std::string _name;
    std::string _directory;
    LMDBEnvironment::SharedPtr _environment;
};
} // namespace bb::lmdblib