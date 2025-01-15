#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/lmdb_transaction.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include <cstdint>
#include <cstring>
#include <exception>
#include <functional>
#include <vector>

namespace bb::lmdblib {

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
} // namespace bb::lmdblib