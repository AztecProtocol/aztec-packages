#include "lmdblib/lmdb_store_base.hpp"

namespace azteclabs::lmdblib {
LMDBStoreBase::LMDBStoreBase(
    std::string directory, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs, bool ephemeral)
    : _dbDirectory(std::move(directory))
    , _environment(std::make_shared<LMDBEnvironment>(_dbDirectory, mapSizeKb, maxDbs, maxNumReaders, ephemeral))
{}
LMDBStoreBase::~LMDBStoreBase() = default;
namespace {
// A transaction returns its permit from its destructor, which never runs if its constructor (mdb_txn_begin) throws, so
// a permit taken before construction has to be given back here
template <typename Make> auto with_permit(LMDBEnvironment& env, void (LMDBEnvironment::*release)(), Make make)
{
    try {
        return make();
    } catch (...) {
        (env.*release)();
        throw;
    }
}
} // namespace

LMDBStoreBase::ReadTransaction::Ptr LMDBStoreBase::create_read_transaction() const
{
    _environment->wait_for_reader();
    return with_permit(*_environment, &LMDBEnvironment::release_reader, [&] {
        return std::make_unique<ReadTransaction>(_environment);
    });
}

LMDBStoreBase::ReadTransaction::SharedPtr LMDBStoreBase::create_shared_read_transaction() const
{
    _environment->wait_for_reader();
    return with_permit(*_environment, &LMDBEnvironment::release_reader, [&] {
        return std::make_shared<ReadTransaction>(_environment);
    });
}

LMDBStoreBase::ReadTransaction::SharedPtr LMDBStoreBase::try_create_shared_read_transaction(uint32_t keepFree) const
{
    if (!_environment->try_wait_for_reader(keepFree)) {
        return nullptr;
    }
    return with_permit(*_environment, &LMDBEnvironment::release_reader, [&] {
        return std::make_shared<ReadTransaction>(_environment);
    });
}

LMDBStoreBase::DBCreationTransaction::Ptr LMDBStoreBase::create_db_transaction() const
{
    _environment->wait_for_writer();
    return with_permit(*_environment, &LMDBEnvironment::release_writer, [&] {
        return std::make_unique<DBCreationTransaction>(_environment);
    });
}

LMDBStoreBase::WriteTransaction::Ptr LMDBStoreBase::create_write_transaction() const
{
    _environment->wait_for_writer();
    return with_permit(*_environment, &LMDBEnvironment::release_writer, [&] {
        return std::make_unique<WriteTransaction>(_environment);
    });
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