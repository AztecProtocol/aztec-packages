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

    template <typename T>
    bool get_value_or_previous(T& key,
                               std::vector<uint8_t>& data,
                               const LMDBDatabase& db,
                               const std::function<bool(const std::vector<uint8_t>&)>& is_valid) const;

    template <typename T> bool get_value_or_previous(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    template <typename T> bool get_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    template <typename T>
    void get_all_values_greater_or_equal_key(const T& key,
                                             std::vector<std::vector<uint8_t>>& data,
                                             const LMDBDatabase& db) const;

    template <typename T>
    void get_all_values_lesser_or_equal_key(const T& key,
                                            std::vector<std::vector<uint8_t>>& data,
                                            const LMDBDatabase& db) const;

    bool get_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    void abort() override;
};

template <typename T>
bool LMDBTreeReadTransaction::get_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    return get_value(keyBuffer, data, db);
}

template <typename T>
bool LMDBTreeReadTransaction::get_value_or_previous(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const
{
    return lmdb_queries::get_value_or_previous(key, data, db, *this);
}

template <typename T>
bool LMDBTreeReadTransaction::get_value_or_previous(
    T& key,
    std::vector<uint8_t>& data,
    const LMDBDatabase& db,
    const std::function<bool(const std::vector<uint8_t>&)>& is_valid) const
{
    return lmdb_queries::get_value_or_previous(key, data, db, is_valid, *this);
}

template <typename T>
void LMDBTreeReadTransaction::get_all_values_greater_or_equal_key(const T& key,
                                                                  std::vector<std::vector<uint8_t>>& data,
                                                                  const LMDBDatabase& db) const
{
    lmdb_queries::get_all_values_greater_or_equal_key(key, data, db, *this);
}

template <typename T>
void LMDBTreeReadTransaction::get_all_values_lesser_or_equal_key(const T& key,
                                                                 std::vector<std::vector<uint8_t>>& data,
                                                                 const LMDBDatabase& db) const
{
    lmdb_queries::get_all_values_lesser_or_equal_key(key, data, db, *this);
}
} // namespace bb::crypto::merkle_tree