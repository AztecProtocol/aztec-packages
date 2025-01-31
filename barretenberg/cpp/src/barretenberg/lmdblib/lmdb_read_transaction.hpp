#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/lmdb_transaction.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include <cstdint>
#include <cstring>
#include <exception>
#include <functional>
#include <memory>
#include <vector>

namespace bb::lmdblib {

/**
 * RAII wrapper around a read transaction.
 * Contains various methods for retrieving values by their keys.
 * Aborts the transaction upon object destruction.
 */
class LMDBReadTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBReadTransaction>;
    using SharedPtr = std::shared_ptr<LMDBReadTransaction>;

    LMDBReadTransaction(LMDBEnvironment::SharedPtr env);
    LMDBReadTransaction(const LMDBReadTransaction& other) = delete;
    LMDBReadTransaction(LMDBReadTransaction&& other) = delete;
    LMDBReadTransaction& operator=(const LMDBReadTransaction& other) = delete;
    LMDBReadTransaction& operator=(LMDBReadTransaction&& other) = delete;

    ~LMDBReadTransaction() override;
};
} // namespace bb::lmdblib