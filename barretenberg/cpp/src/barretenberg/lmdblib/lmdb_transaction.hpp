#pragma once
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include "lmdb.h"
#include <cstdint>
#include <functional>
#include <vector>

namespace bb::lmdblib {

/*
 * Abstract base class to represent and LMDB transaction.
 * Needs to be sub-classed to be either a read or write transaction.
 */

enum TransactionState {
    OPEN,
    COMMITTED,
    ABORTED,
};

class LMDBTransaction {
  public:
    LMDBTransaction(LMDBEnvironment::SharedPtr env, bool readOnly = false);
    LMDBTransaction(const LMDBTransaction& other) = delete;
    LMDBTransaction(LMDBTransaction&& other) = delete;
    LMDBTransaction& operator=(const LMDBTransaction& other) = delete;
    LMDBTransaction& operator=(LMDBTransaction&& other) = delete;

    virtual ~LMDBTransaction() = 0;

    MDB_txn* underlying() const;

    uint64_t id() const;

    /*
     * Rolls back the transaction.
     * Must be called by read transactions to signal the end of the transaction.
     * Must be called by write transactions if the changes are not to be committed.
     */
    virtual void abort();

    template <typename T, typename K>
    bool get_value_or_previous(T& key,
                               K& data,
                               const LMDBDatabase& db,
                               const std::function<bool(const MDB_val&)>& is_valid) const;

    template <typename T, typename K> bool get_value_or_previous(T& key, K& data, const LMDBDatabase& db) const;

    template <typename T, typename K> bool get_value_or_greater(T& key, K& data, const LMDBDatabase& db) const;

    template <typename T> bool get_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    template <typename T> bool get_value(T& key, uint64_t& data, const LMDBDatabase& db) const;

    template <typename T>
    void get_all_values_greater_or_equal_key(const T& key,
                                             std::vector<std::vector<uint8_t>>& data,
                                             const LMDBDatabase& db) const;

    template <typename T>
    void get_all_values_lesser_or_equal_key(const T& key,
                                            std::vector<std::vector<uint8_t>>& data,
                                            const LMDBDatabase& db) const;

    bool get_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const;

    bool get_value(std::vector<uint8_t>& key, uint64_t& data, const LMDBDatabase& db) const;

  protected:
    std::shared_ptr<LMDBEnvironment> _environment;
    uint64_t _id;
    MDB_txn* _transaction;
    TransactionState state;
};

template <typename T> bool LMDBTransaction::get_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db) const
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    return get_value(keyBuffer, data, db);
}

template <typename T> bool LMDBTransaction::get_value(T& key, uint64_t& data, const LMDBDatabase& db) const
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    return get_value(keyBuffer, data, db);
}

template <typename T, typename K>
bool LMDBTransaction::get_value_or_previous(T& key, K& data, const LMDBDatabase& db) const
{
    return lmdb_queries::get_value_or_previous(key, data, db, *this);
}

template <typename T, typename K>
bool LMDBTransaction::get_value_or_greater(T& key, K& data, const LMDBDatabase& db) const
{
    return lmdb_queries::get_value_or_greater(key, data, db, *this);
}

template <typename T, typename K>
bool LMDBTransaction::get_value_or_previous(T& key,
                                            K& data,
                                            const LMDBDatabase& db,
                                            const std::function<bool(const MDB_val&)>& is_valid) const
{
    return lmdb_queries::get_value_or_previous(key, data, db, is_valid, *this);
}

template <typename T>
void LMDBTransaction::get_all_values_greater_or_equal_key(const T& key,
                                                          std::vector<std::vector<uint8_t>>& data,
                                                          const LMDBDatabase& db) const
{
    lmdb_queries::get_all_values_greater_or_equal_key(key, data, db, *this);
}

template <typename T>
void LMDBTransaction::get_all_values_lesser_or_equal_key(const T& key,
                                                         std::vector<std::vector<uint8_t>>& data,
                                                         const LMDBDatabase& db) const
{
    lmdb_queries::get_all_values_lesser_or_equal_key(key, data, db, *this);
}
} // namespace bb::lmdblib