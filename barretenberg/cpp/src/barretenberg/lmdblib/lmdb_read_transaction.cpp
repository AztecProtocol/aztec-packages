#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include <cstdint>

namespace bb::lmdblib {
LMDBTreeReadTransaction::LMDBTreeReadTransaction(LMDBEnvironment::SharedPtr env)
    : LMDBTransaction(env, true)
{}

LMDBTreeReadTransaction::~LMDBTreeReadTransaction()
{
    abort();
}

void LMDBTreeReadTransaction::abort()
{
    LMDBTransaction::abort();
    _environment->release_reader();
}
} // namespace bb::lmdblib
