#include "barretenberg/lmdblib/lmdb_store_base.hpp"

namespace bb::lmdblib {
namespace {

class TransactionGuard {
  public:
    enum class Type { READ, WRITE };

    TransactionGuard(const LMDBEnvironment::SharedPtr& environment, Type type)
        : _environment(environment)
        , _type(type)
    {
        if (_type == Type::READ) {
            _environment->wait_for_reader();
        } else {
            _environment->wait_for_writer();
        }
    }

    TransactionGuard(const TransactionGuard& other) = delete;
    TransactionGuard(TransactionGuard&& other) = delete;
    TransactionGuard& operator=(const TransactionGuard& other) = delete;
    TransactionGuard& operator=(TransactionGuard&& other) = delete;

    ~TransactionGuard()
    {
        if (!_active) {
            return;
        }
        if (_type == Type::READ) {
            _environment->release_reader();
        } else {
            _environment->release_writer();
        }
    }

    void release_to_transaction() { _active = false; }

  private:
    LMDBEnvironment::SharedPtr _environment;
    Type _type;
    bool _active = true;
};

} // namespace

LMDBStoreBase::LMDBStoreBase(
    std::string directory, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs, bool ephemeral)
    : _dbDirectory(std::move(directory))
    , _environment(std::make_shared<LMDBEnvironment>(_dbDirectory, mapSizeKb, maxDbs, maxNumReaders, ephemeral))
{}
LMDBStoreBase::~LMDBStoreBase() = default;
LMDBStoreBase::ReadTransaction::Ptr LMDBStoreBase::create_read_transaction() const
{
    TransactionGuard guard(_environment, TransactionGuard::Type::READ);
    auto tx = std::make_unique<ReadTransaction>(_environment);
    guard.release_to_transaction();
    return tx;
}

LMDBStoreBase::ReadTransaction::SharedPtr LMDBStoreBase::create_shared_read_transaction() const
{
    TransactionGuard guard(_environment, TransactionGuard::Type::READ);
    auto tx = std::make_shared<ReadTransaction>(_environment);
    guard.release_to_transaction();
    return tx;
}

LMDBStoreBase::DBCreationTransaction::Ptr LMDBStoreBase::create_db_transaction() const
{
    TransactionGuard guard(_environment, TransactionGuard::Type::WRITE);
    auto tx = std::make_unique<DBCreationTransaction>(_environment);
    guard.release_to_transaction();
    return tx;
}

LMDBStoreBase::WriteTransaction::Ptr LMDBStoreBase::create_write_transaction() const
{
    TransactionGuard guard(_environment, TransactionGuard::Type::WRITE);
    auto tx = std::make_unique<WriteTransaction>(_environment);
    guard.release_to_transaction();
    return tx;
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

} // namespace bb::lmdblib
