#pragma once
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"

namespace bb::crypto::merkle_tree {

class LMDBWriteTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBWriteTransaction>;

    LMDBWriteTransaction(LMDBEnvironment& env, const LMDBDatabase& database);
    LMDBWriteTransaction(const LMDBWriteTransaction& other) = delete;
    LMDBWriteTransaction(LMDBWriteTransaction&& other) = delete;
    LMDBWriteTransaction& operator=(const LMDBWriteTransaction& other) = delete;
    LMDBWriteTransaction& operator=(LMDBWriteTransaction&& other) = delete;
    ~LMDBWriteTransaction() override;

    void put_node(uint32_t level, index_t index, std::vector<uint8_t>& data);

    template <typename T> void put_value_by_integer(T& key, std::vector<uint8_t>& data);

    void put_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data);

    void commit();

    void tryAbort();

  protected:
    const LMDBDatabase& _database;
};

template <typename T> void LMDBWriteTransaction::put_value_by_integer(T& key, std::vector<uint8_t>& data)
{
    MDB_val dbKey;
    dbKey.mv_size = sizeof(T);
    dbKey.mv_data = &key;

    MDB_val dbVal;
    dbVal.mv_size = data.size();
    dbVal.mv_data = (void*)data.data();
    call_lmdb_func("mdb_put", mdb_put, underlying(), _database.underlying(), &dbKey, &dbVal, 0U);
}
} // namespace bb::crypto::merkle_tree