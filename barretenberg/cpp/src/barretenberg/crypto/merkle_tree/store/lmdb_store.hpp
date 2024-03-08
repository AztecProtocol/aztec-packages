#pragma once
#include <cmath>
#include <lmdb.h>
#include <sys/stat.h>

namespace bb::crypto::merkle_tree {

class LMDBEnvironment {
  public:
    LMDBEnvironment(const std::string& directory)
    {
        if (mdb_env_create(&_mdbEnv) != 0) {
            // throw here
        }
        mdb_env_set_mapsize(_mdbEnv, (size_t)1048576 * (size_t)100000); // 1MB * 100000
        mdb_env_set_maxdbs(_mdbEnv, 1);
        if (mdb_env_open(_mdbEnv, directory.c_str(), 0, S_IRWXU | S_IRWXG | S_IRWXO) != 0) {
            mdb_env_close(_mdbEnv);
            // throw here
        }
    }

    ~LMDBEnvironment() { mdb_env_close(_mdbEnv); }

    MDB_env* underlying() const { return _mdbEnv; }

  private:
    MDB_env* _mdbEnv;
};

class LMDBTransaction {
  public:
    LMDBTransaction(const LMDBEnvironment& env, bool readOnly = true)
        : _readOnly(readOnly)
    {
        if (mdb_txn_begin(env.underlying(), nullptr, _readOnly ? MDB_RDONLY : 0, &_transaction) != 0) {
            // throw
        }
    }

    ~LMDBTransaction()
    {
        if (_readOnly) {
            mdb_txn_abort(_transaction);
        } else {
            mdb_txn_commit(_transaction);
        }
    }

    MDB_txn* underlying() const { return _transaction; }

  private:
    MDB_txn* _transaction;
    bool _readOnly;
};

class LMDBDatabase {
  public:
    LMDBDatabase(const LMDBEnvironment& env, const LMDBTransaction& transaction, const std::string& name)
        : _environment(env)
    {
        if (mdb_dbi_open(transaction.underlying(), name.c_str(), MDB_INTEGERKEY | MDB_CREATE, &_dbi) != 0) {
            // throw here
        }
    }

    ~LMDBDatabase() { mdb_dbi_close(_environment.underlying(), _dbi); }

    MDB_dbi& underlying() { return _dbi; }

  private:
    MDB_dbi _dbi;
    const LMDBEnvironment& _environment;
};

class LMDBStore {

  public:
    LMDBStore(const std::string& directory, const std::string& name)
        : _environment(directory)
        , _name(name)
    {}
    ~LMDBStore() {}

    void put(size_t level, size_t index, const std::vector<uint8_t>& data)
    {
        const LMDBTransaction transaction(_environment, false);
        LMDBDatabase database(_environment, transaction, _name);
        size_t key = (1 << level) + index - 1;

        MDB_val dbKey;
        dbKey.mv_size = sizeof(key);
        dbKey.mv_data = &key;

        MDB_val dbVal;
        dbVal.mv_size = data.size();
        dbVal.mv_data = static_cast<void*>(&data[0]);
        int error = mdb_put(transaction.underlying(), database.underlying(), &dbKey, &dbVal, 0);

        if (error == 0) {
            return;
        }
        std::cout << "ERROR When writing to DB" << std::endl;
    }
    bool get(size_t level, size_t index, std::vector<uint8_t>& data) const
    {
        const LMDBTransaction transaction(_environment, true);
        LMDBDatabase database(_environment, transaction, _name);
        size_t key = (1 << level) + index - 1;

        MDB_val dbKey;
        dbKey.mv_size = sizeof(key);
        dbKey.mv_data = &key;

        MDB_val dbVal;
        int error = mdb_get(transaction.underlying(), database.underlying(), &dbKey, &dbVal);

        if (error == 0) {
            data.resize(dbVal.mv_size);
            std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
            return;
        }

        switch (error) {
        case MDB_NOTFOUND:
            std::cout << "Key " << key << " not found" << std::endl;
            break;
        case EINVAL:
            std::cout << "INVALID PARAMETER" << std::endl;
            break;
        default:
            std::cout << "Received error " << error << std::endl;
            break;
        }
    }

  private:
    LMDBEnvironment _environment;
    const std::string _name;
};
} // namespace bb::crypto::merkle_tree