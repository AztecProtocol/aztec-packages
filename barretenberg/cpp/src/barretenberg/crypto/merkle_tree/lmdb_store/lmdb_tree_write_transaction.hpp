#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/queries.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <exception>

namespace bb::crypto::merkle_tree {

/**
 * RAII wrapper for an LMDB write transaction.
 * Provides methods for writing values by their key.
 * Must be either committed to persist the changes or aborted to roll them back.
 * Will automatically abort the transaction during destruction if changes have not been committed.
 */

class LMDBTreeWriteTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBTreeWriteTransaction>;

    LMDBTreeWriteTransaction(LMDBEnvironment::SharedPtr env);
    LMDBTreeWriteTransaction(const LMDBTreeWriteTransaction& other) = delete;
    LMDBTreeWriteTransaction(LMDBTreeWriteTransaction&& other) = delete;
    LMDBTreeWriteTransaction& operator=(const LMDBTreeWriteTransaction& other) = delete;
    LMDBTreeWriteTransaction& operator=(LMDBTreeWriteTransaction&& other) = delete;
    ~LMDBTreeWriteTransaction() override;

    template <typename T> void put_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db);

    void put_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db);

    template <typename T> void delete_value(T& key, const LMDBDatabase& db);

    void delete_value(std::vector<uint8_t>& key, const LMDBDatabase& db);

    // There are a the following two 'getters' here copied from LMDBTreeReadTransaction
    // This could be rationalised to prevent the duplication
    template <typename T> bool get_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    template <typename T>
    void get_all_values_greater_or_equal_key(const T& key,
                                             std::vector<std::vector<uint8_t>>& data,
                                             const LMDBDatabase& db) const;

    template <typename T> void delete_all_values_greater_or_equal_key(const T& key, const LMDBDatabase& db) const;

    template <typename T>
    void get_all_values_lesser_or_equal_key(const T& key,
                                            std::vector<std::vector<uint8_t>>& data,
                                            const LMDBDatabase& db) const;

    template <typename T> void delete_all_values_lesser_or_equal_key(const T& key, const LMDBDatabase& db) const;

    bool get_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    void commit();

    void try_abort();
};

template <typename T>
bool LMDBTreeWriteTransaction::get_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    return get_value(keyBuffer, data, db);
}

template <typename T>
void LMDBTreeWriteTransaction::put_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db)
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    put_value(keyBuffer, data, db);
}

template <typename T> void LMDBTreeWriteTransaction::delete_value(T& key, const LMDBDatabase& db)
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    delete_value(keyBuffer, db);
}

template <typename T>
void LMDBTreeWriteTransaction::get_all_values_greater_or_equal_key(const T& key,
                                                                   std::vector<std::vector<uint8_t>>& data,
                                                                   const LMDBDatabase& db) const
{
    lmdb_queries::get_all_values_greater_or_equal_key(key, data, db, *this);
}

template <typename T>
void LMDBTreeWriteTransaction::delete_all_values_greater_or_equal_key(const T& key, const LMDBDatabase& db) const
{
    lmdb_queries::delete_all_values_greater_or_equal_key(key, db, *this);
}

template <typename T>
void LMDBTreeWriteTransaction::get_all_values_lesser_or_equal_key(const T& key,
                                                                  std::vector<std::vector<uint8_t>>& data,
                                                                  const LMDBDatabase& db) const
{
    lmdb_queries::get_all_values_lesser_or_equal_key(key, data, db, *this);
}

template <typename T>
void LMDBTreeWriteTransaction::delete_all_values_lesser_or_equal_key(const T& key, const LMDBDatabase& db) const
{
    lmdb_queries::delete_all_values_lesser_or_equal_key(key, db, *this);
}
} // namespace bb::crypto::merkle_tree