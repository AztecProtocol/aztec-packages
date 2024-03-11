#pragma once
#include <cmath>
#include <cstring>
#include <lmdb.h>
#include <sys/stat.h>

namespace bb::crypto::merkle_tree {

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
    LMDBTransaction(const LMDBEnvironment& env, bool readOnly = true);

    ~LMDBTransaction();

    MDB_txn* underlying() const;

    bool commit();

  private:
    MDB_txn* _transaction;
    bool _readOnly;
    bool _committed;
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

    void put(size_t level, size_t index, std::vector<uint8_t>& data);
    bool get(size_t level, size_t index, std::vector<uint8_t>& data) const;

  private:
    LMDBEnvironment& _environment;
    const std::string _name;
    LMDBDatabase _database;
};
} // namespace bb::crypto::merkle_tree