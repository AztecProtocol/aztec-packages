#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"

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

    void commit();

    void try_abort();
};

template <typename T>
void LMDBTreeWriteTransaction::put_value(T& key, std::vector<uint8_t>& data, const LMDBDatabase& db)
{
    std::vector<uint8_t> keyBuffer = serialise_key(key);
    put_value(keyBuffer, data, db);
}
} // namespace bb::crypto::merkle_tree