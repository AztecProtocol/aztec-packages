#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/queries.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include <cstdint>
#include <cstring>
#include <exception>
#include <functional>
#include <vector>

namespace bb::crypto::merkle_tree {

/**
 * RAII wrapper around a read transaction.
 * Contains various methods for retrieving values by their keys.
 * Aborts the transaction upon object destruction.
 */
class LMDBTreeReadTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBTreeReadTransaction>;

    LMDBTreeReadTransaction(LMDBEnvironment::SharedPtr env);
    LMDBTreeReadTransaction(const LMDBTreeReadTransaction& other) = delete;
    LMDBTreeReadTransaction(LMDBTreeReadTransaction&& other) = delete;
    LMDBTreeReadTransaction& operator=(const LMDBTreeReadTransaction& other) = delete;
    LMDBTreeReadTransaction& operator=(LMDBTreeReadTransaction&& other) = delete;

    ~LMDBTreeReadTransaction() override;

    void abort() override;
};
} // namespace bb::crypto::merkle_tree