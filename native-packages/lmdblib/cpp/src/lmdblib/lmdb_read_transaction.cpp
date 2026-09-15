#include "lmdblib/lmdb_read_transaction.hpp"
#include "lmdblib/lmdb_environment.hpp"
#include "lmdblib/lmdb_helpers.hpp"
#include <cstdint>

namespace azteclabs::lmdblib {
LMDBReadTransaction::LMDBReadTransaction(LMDBEnvironment::SharedPtr env)
    : LMDBTransaction(env, true)
{}

LMDBReadTransaction::~LMDBReadTransaction()
{
    LMDBTransaction::abort();
    _environment->release_reader();
}
} // namespace azteclabs::lmdblib
