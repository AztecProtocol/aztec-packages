#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_read_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include <cstdint>

namespace bb::crypto::merkle_tree {
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
} // namespace bb::crypto::merkle_tree
