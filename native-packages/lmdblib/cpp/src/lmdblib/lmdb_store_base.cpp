#include "lmdblib/lmdb_store_base.hpp"

namespace azteclabs::lmdblib {
LMDBStoreBase::LMDBStoreBase(
    std::string directory, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs, bool ephemeral)
    : _dbDirectory(std::move(directory))
    , _environment(std::make_shared<LMDBEnvironment>(_dbDirectory, mapSizeKb, maxDbs, maxNumReaders, ephemeral))
{}
LMDBStoreBase::~LMDBStoreBase() = default;
// A transaction returns its permit from its destructor, which never runs if its constructor (mdb_txn_begin) throws
LMDBStoreBase::ReadTransaction::Ptr LMDBStoreBase::create_read_transaction() const
{
    _environment->wait_for_reader();
    try {
        return std::make_unique<ReadTransaction>(_environment);
    } catch (...) {
        _environment->release_reader();
        throw;
    }
}

LMDBStoreBase::ReadTransaction::SharedPtr LMDBStoreBase::create_shared_read_transaction() const
{
    _environment->wait_for_reader();
    try {
        return std::make_shared<ReadTransaction>(_environment);
    } catch (...) {
        _environment->release_reader();
        throw;
    }
}

LMDBStoreBase::ReadTransaction::SharedPtr LMDBStoreBase::try_create_shared_read_transaction(uint32_t keepFree) const
{
    if (!_environment->try_wait_for_reader(keepFree)) {
        return nullptr;
    }
    try {
        return std::make_shared<ReadTransaction>(_environment);
    } catch (...) {
        _environment->release_reader();
        throw;
    }
}

LMDBStoreBase::DBCreationTransaction::Ptr LMDBStoreBase::create_db_transaction() const
{
    _environment->wait_for_writer();
    try {
        return std::make_unique<DBCreationTransaction>(_environment);
    } catch (...) {
        _environment->release_writer();
        throw;
    }
}

LMDBStoreBase::WriteTransaction::Ptr LMDBStoreBase::create_write_transaction() const
{
    _environment->wait_for_writer();
    try {
        return std::make_unique<WriteTransaction>(_environment);
    } catch (...) {
        _environment->release_writer();
        throw;
    }
}

void LMDBStoreBase::copy_store(const std::string& dstPath, bool compact)
{
    // Create a write tx to acquire a write lock to prevent writes while copying. From LMDB docs:
    // "[mdb_copy] can trigger significant file size growth if run in parallel with write transactions,
    //  because pages which they free during copying cannot be reused until the copy is done."
    WriteTransaction::Ptr tx = create_write_transaction();
    call_lmdb_func("mdb_env_copy2",
                   mdb_env_copy2,
                   _environment->underlying(),
                   dstPath.c_str(),
                   static_cast<unsigned int>(compact ? MDB_CP_COMPACT : 0));
}

} // namespace azteclabs::lmdblib