#pragma once
#include <cmath>
#include <condition_variable>
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
    if (error != 0 && error != MDB_NOTFOUND) {
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
    LMDBEnvironment(const std::string& directory,
                    unsigned long mapSizeMB,
                    unsigned long maxNumDBs,
                    unsigned int maxNumReaders);

    ~LMDBEnvironment() { call_lmdb_func(mdb_env_close, _mdbEnv); }

    MDB_env* underlying() const { return _mdbEnv; }

    void waitForReader();

    void releaseReader();

  private:
    MDB_env* _mdbEnv;
    unsigned int _maxReaders;
    unsigned int _numReaders;
    std::mutex _readersLock;
    std::condition_variable _readersCondition;
};

class LMDBDatabase;

class LMDBTransaction {
  public:
    LMDBTransaction(const LMDBEnvironment& env, bool readOnly = false)
        : _environment(env)
    {
        MDB_txn* p = nullptr;
        if (readOnly) {
            std::cout << "Starting Read" << std::endl;
        }
        if (!call_lmdb_func(mdb_txn_begin, _environment.underlying(), p, readOnly ? MDB_RDONLY : 0U, &_transaction)) {
            // throw here
        }
    }

    virtual ~LMDBTransaction() {}

    MDB_txn* underlying() const { return _transaction; }

  protected:
    LMDBEnvironment& _environment;
    MDB_txn* _transaction;
};

class LMDBReadTransaction : public LMDBTransaction {
  public:
    typedef std::unique_ptr<LMDBReadTransaction> Ptr;

    LMDBReadTransaction(LMDBEnvironment& env, const LMDBDatabase& database)
        : LMDBTransaction(env, true)
        , _environment(env)
        , _database(database)
    {}

    virtual ~LMDBReadTransaction() { abort(); }

    bool get(size_t level, size_t index, std::vector<uint8_t>& data) const;

  private:
    const LMDBDatabase& _database;

    void abort()
    {
        std::cout << "Aborting Read" << std::endl;
        call_lmdb_func(mdb_txn_abort, _transaction);
        _environment.releaseReader();
    }
};

class LMDBWriteTransaction : public LMDBTransaction {
  public:
    typedef std::unique_ptr<LMDBWriteTransaction> Ptr;

    LMDBWriteTransaction(const LMDBEnvironment& env, const LMDBDatabase& database)
        : LMDBTransaction(env)
        , _committed(false)
        , _database(database)
    {}

    virtual ~LMDBWriteTransaction() { commit(); }

    void put(size_t level, size_t index, std::vector<uint8_t>& data) { put(level, index, data, data.size()); }
    void put(size_t level, size_t start_index, std::vector<uint8_t>& data, size_t element_size);

    bool commit()
    {
        if (_committed) {
            return true;
        }
        _committed = call_lmdb_func(mdb_txn_commit, _transaction);
        return _committed;
    }

  private:
    bool _committed;
    const LMDBDatabase& _database;
};

class LMDBDatabaseCreationTransaction : public LMDBTransaction {
  public:
    typedef std::unique_ptr<LMDBDatabaseCreationTransaction> Ptr;

    LMDBDatabaseCreationTransaction(const LMDBEnvironment& env)
        : LMDBTransaction(env)
    {}

    virtual ~LMDBDatabaseCreationTransaction() { commit(); }

  private:
    bool commit() { return call_lmdb_func(mdb_txn_commit, _transaction); }
};

class LMDBDatabase {
  public:
    LMDBDatabase(const LMDBEnvironment& env, const LMDBTransaction& transaction, const std::string& name)
        : _environment(env)
    {
        unsigned int flags = MDB_CREATE | MDB_INTEGERKEY;
        if (!call_lmdb_func(mdb_dbi_open, transaction.underlying(), name.c_str(), flags, &_dbi)) {
            // throw here
        }
    }

    ~LMDBDatabase() { call_lmdb_func(mdb_dbi_close, _environment.underlying(), _dbi); }

    const MDB_dbi& underlying() const { return _dbi; }

  private:
    MDB_dbi _dbi;
    const LMDBEnvironment& _environment;
};

class LMDBStore {

  public:
    LMDBStore(LMDBEnvironment& environment, const std::string& name)
        : _environment(environment)
        , _name(name)
        , _database(_environment, LMDBDatabaseCreationTransaction(_environment), _name)
    {}
    ~LMDBStore() {}

    LMDBWriteTransaction::Ptr createWriteTransaction() const
    {
        return std::make_unique<LMDBWriteTransaction>(_environment, _database);
    }
    LMDBReadTransaction::Ptr createReadTransaction();

  private:
    LMDBEnvironment& _environment;
    const std::string _name;
    LMDBDatabase _database;
};
} // namespace bb::db_cli