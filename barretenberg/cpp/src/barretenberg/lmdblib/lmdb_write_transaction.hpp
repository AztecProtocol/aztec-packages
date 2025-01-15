#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
#include "barretenberg/lmdblib/lmdb_transaction.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include "lmdb.h"
#include <cstdint>
#include <exception>

namespace bb::lmdblib {

/**
 * RAII wrapper for an LMDB write transaction.
 * Provides methods for writing values by their key.
 * Must be either committed to persist the changes or aborted to roll them back.
 * Will automatically abort the transaction during destruction if changes have not been committed.
 */

class LMDBWriteTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBWriteTransaction>;

    LMDBWriteTransaction(LMDBEnvironment::SharedPtr env);
    LMDBWriteTransaction(const LMDBWriteTransaction& other) = delete;
    LMDBWriteTransaction(LMDBWriteTransaction&& other) = delete;
    LMDBWriteTransaction& operator=(const LMDBWriteTransaction& other) = delete;
    LMDBWriteTransaction& operator=(LMDBWriteTransaction&& other) = delete;
    ~LMDBWriteTransaction() override;

    template <typename T> void put_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db);

    template <typename T> void put_value(T& key, const uint64_t& data, const LMDBDatabase& db);

    void put_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db);

    void put_value(std::vector<uint8_t>& key, const uint64_t& data, const LMDBDatabase& db);

    template <typename T> void delete_value(T& key, const LMDBDatabase& db);

    void delete_value(std::vector<uint8_t>& key, const LMDBDatabase& db);

    template <typename T> void delete_all_values_greater_or_equal_key(const T& key, const LMDBDatabase& db) const;

    template <typename T> void delete_all_values_lesser_or_equal_key(const T& key, const LMDBDatabase& db) const;

    void commit();

    void try_abort();
};

template <typename T> void LMDBWriteTransaction::put_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db)
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    put_value(keyBuffer, data, db);
}

template <typename T> void LMDBWriteTransaction::put_value(T& key, const uint64_t& data, const LMDBDatabase& db)
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    put_value(keyBuffer, data, db);
}

template <typename T> void LMDBWriteTransaction::delete_value(T& key, const LMDBDatabase& db)
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    lmdb_queries::delete_value(keyBuffer, db, *this);
}

template <typename T>
void LMDBWriteTransaction::delete_all_values_greater_or_equal_key(const T& key, const LMDBDatabase& db) const
{
    lmdb_queries::delete_all_values_greater_or_equal_key(key, db, *this);
}

template <typename T>
void LMDBWriteTransaction::delete_all_values_lesser_or_equal_key(const T& key, const LMDBDatabase& db) const
{
    lmdb_queries::delete_all_values_lesser_or_equal_key(key, db, *this);
}
} // namespace bb::lmdblib