#include "barretenberg/lmdblib/lmdb_store_base.hpp"

namespace bb::lmdblib {
LMDBStoreBase::LMDBStoreBase(std::string directory, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs)
    : _dbDirectory(std::move(directory))
    , _environment((std::make_shared<LMDBEnvironment>(_dbDirectory, mapSizeKb, maxDbs, maxNumReaders)))
{}
LMDBStoreBase::~LMDBStoreBase() = default;
LMDBStoreBase::ReadTransaction::Ptr LMDBStoreBase::create_read_transaction() const
{
    _environment->wait_for_reader();
    return std::make_unique<ReadTransaction>(_environment);
}

LMDBStoreBase::ReadTransaction::SharedPtr LMDBStoreBase::create_shared_read_transaction() const
{
    _environment->wait_for_reader();
    return std::make_shared<ReadTransaction>(_environment);
}

LMDBStoreBase::DBCreationTransaction::Ptr LMDBStoreBase::create_db_transaction() const
{
    _environment->wait_for_writer();
    return std::make_unique<DBCreationTransaction>(_environment);
}

LMDBStoreBase::WriteTransaction::Ptr LMDBStoreBase::create_write_transaction() const
{
    _environment->wait_for_writer();
    return std::make_unique<WriteTransaction>(_environment);
}
} // namespace bb::lmdblib