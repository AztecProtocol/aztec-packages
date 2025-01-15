#include "barretenberg/lmdblib/lmdb_store.hpp"

namespace bb::lmdblib {
LMDBStore::LMDBStore(
    std::string directory, std::string name, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs)
    : _name(std::move(name))
    , _directory(std::move(directory))
    , _environment(std::make_shared<LMDBEnvironment>(_directory, mapSizeKb, maxDbs, maxNumReaders))
{}

LMDBStore::WriteTransaction::Ptr LMDBStore::create_write_transaction() const
{
    return std::make_unique<LMDBWriteTransaction>(_environment);
}
LMDBStore::ReadTransaction::Ptr LMDBStore::create_read_transaction()
{
    _environment->wait_for_reader();
    return std::make_unique<LMDBReadTransaction>(_environment);
}
} // namespace bb::lmdblib