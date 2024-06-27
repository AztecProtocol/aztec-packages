#pragma once
#include "barretenberg/crypto/merkle_tree/lmdb_store/functions.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_db_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"

namespace bb::crypto::merkle_tree {
class LMDBDatabase {
  public:
    LMDBDatabase(const LMDBEnvironment& env,
                 const LMDBDatabaseCreationTransaction& transaction,
                 const std::string& name,
                 bool integerKeys = false,
                 bool reverseKeys = false,
                 MDB_cmp_func* cmp = nullptr);

    LMDBDatabase(const LMDBDatabase& other) = delete;
    LMDBDatabase(LMDBDatabase&& other) = delete;
    LMDBDatabase& operator=(const LMDBDatabase& other) = delete;
    LMDBDatabase& operator=(LMDBDatabase&& other) = delete;

    ~LMDBDatabase();

    const MDB_dbi& underlying() const;

  private:
    MDB_dbi _dbi;
    const LMDBEnvironment& _environment;
};

// LMDBDatabase::LMDBDatabase(const LMDBEnvironment& env,
//                            const LMDBDatabaseCreationTransaction& transaction,
//                            const std::string& name,
//                            bool integerKeys,
//                            bool reverseKeys,
//                            MDB_cmp_func* cmp)
//     : _environment(env)
// {
//     unsigned int flags = MDB_CREATE;
//     if (integerKeys) {
//         flags |= MDB_INTEGERKEY;
//     }
//     if (reverseKeys) {
//         flags |= MDB_REVERSEKEY;
//     }
//     call_lmdb_func("mdb_dbi_open", mdb_dbi_open, transaction.underlying(), name.c_str(), flags, &_dbi);
//     if (cmp != nullptr) {
//         call_lmdb_func("mdb_set_compare", mdb_set_compare, transaction.underlying(), _dbi, cmp);
//     }
//     transaction.commit();
// }

// LMDBDatabase::~LMDBDatabase()
// {
//     call_lmdb_func(mdb_dbi_close, _environment.underlying(), _dbi);
// }

// const MDB_dbi& LMDBDatabase::underlying() const
// {
//     return _dbi;
// }
} // namespace bb::crypto::merkle_tree
