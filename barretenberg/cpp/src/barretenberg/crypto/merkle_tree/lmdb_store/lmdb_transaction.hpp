#pragma once
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"

namespace bb::crypto::merkle_tree {

enum TransactionState {
    OPEN,
    COMMITTED,
    ABORTED,
};

class LMDBTransaction {
  public:
    LMDBTransaction(LMDBEnvironment& env, bool readOnly = false);
    LMDBTransaction(const LMDBTransaction& other) = delete;
    LMDBTransaction(LMDBTransaction&& other) = delete;
    LMDBTransaction& operator=(const LMDBTransaction& other) = delete;
    LMDBTransaction& operator=(LMDBTransaction&& other) = delete;

    virtual ~LMDBTransaction() = default;

    MDB_txn* underlying() const;

    virtual void abort();

  protected:
    LMDBEnvironment& _environment;
    MDB_txn* _transaction;
    TransactionState state;
};
} // namespace bb::crypto::merkle_tree