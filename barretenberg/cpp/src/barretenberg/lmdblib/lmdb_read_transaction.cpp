#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include <cstdint>

namespace bb::lmdblib {
LMDBReadTransaction::LMDBReadTransaction(LMDBEnvironment::SharedPtr env)
    : LMDBTransaction(env, true)
{}

LMDBReadTransaction::~LMDBReadTransaction()
{
    abort();
}

void LMDBReadTransaction::abort()
{
    LMDBTransaction::abort();
    _environment->release_reader();
}
} // namespace bb::lmdblib
