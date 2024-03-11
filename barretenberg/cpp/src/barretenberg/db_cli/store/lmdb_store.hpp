#pragma once
#include <cmath>
#include <cstring>
#include <iostream>
#include <lmdb.h>
#include <memory>
#include <sys/stat.h>
#include <vector>

namespace bb::db_cli {

template <typename... TArgs> bool call_lmdb_func(int (*f)(TArgs...), TArgs... args)
{
    int error = f(args...);
    if (error != 0) {
        std::cout << "ERROR: " << mdb_strerror(error) << std::endl;
    }
    return error == 0;
}

template <typename... TArgs> void call_lmdb_func(void (*f)(TArgs...), TArgs... args)
{
    f(args...);
}

class LMDBEnvironment {
  public:
    LMDBEnvironment(const std::string& directory);

    ~LMDBEnvironment();

    MDB_env* underlying() const;

  private:
    MDB_env* _mdbEnv;
};

class LMDBTransaction {
  public:
    LMDBTransaction(const LMDBEnvironment& env, const LMDBDatabase& database, bool readOnly = true);

    ~LMDBTransaction();

    MDB_txn* underlying() const;

    void put(size_t level, size_t index, std::vector<uint8_t>& data);
    void put(size_t level, size_t start_index, std::vector<uint8_t>& data, size_t element_size);
    bool commit();

  private:
    bool _readOnly;
    bool _committed;
    const LMDBDatabase& _database;
    MDB_txn* _transaction;
};

class LMDBDatabase {
  public:
    LMDBDatabase(const LMDBEnvironment& env, const LMDBTransaction& transaction, const std::string& name);

    ~LMDBDatabase();

    const MDB_dbi& underlying() const;

  private:
    MDB_dbi _dbi;
    const LMDBEnvironment& _environment;
};

class LMDBStore {

  public:
    LMDBStore(LMDBEnvironment& environment, const std::string& name);
    ~LMDBStore();

    bool get(size_t level, size_t index, std::vector<uint8_t>& data) const;

    std::unique_ptr<LMDBTransaction> createWriteTransaction();

  private:
    LMDBEnvironment& _environment;
    const std::string _name;
    LMDBDatabase _database;
    std::unique_ptr<LMDBTransaction> _writeTransaction;
};
} // namespace bb::db_cli