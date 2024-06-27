#pragma once
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <lmdb.h>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <sys/stat.h>
#include <utility>
#include <vector>

namespace bb::crypto::merkle_tree {

using NodeKeyType = uint128_t;
using LeafIndexKeyType = uint64_t;
using FrKeyType = uint256_t;
using MetaKeyType = uint8_t;

int SizeCmp(const MDB_val* a, const MDB_val* b);

int Invalid(const MDB_val*, const MDB_val*);

template <typename T> int ValueCmp(const MDB_val* a, const MDB_val* b)
{
    const T* lhs = static_cast<const T*>(a->mv_data);
    const T* rhs = static_cast<const T*>(b->mv_data);
    if (*lhs < *rhs) {
        return -1;
    }
    if (*lhs > *rhs) {
        return 1;
    }
    return 0;
}

int IntegerKeyCmp(const MDB_val* a, const MDB_val* b);

template <typename... TArgs> bool call_lmdb_func(int (*f)(TArgs...), TArgs... args)
{
    int error = f(args...);
    if (error != 0 && error != MDB_NOTFOUND) {
        std::stringstream ss;
        ss << "ERROR: " << mdb_strerror(error) << std::endl;
        std::cerr << ss.str();
    }
    return error == 0;
}

template <typename... TArgs> void call_lmdb_func(void (*f)(TArgs...), TArgs... args)
{
    f(args...);
}

class LMDBEnvironment {
  public:
    LMDBEnvironment(const std::string& directory, uint64_t mapSizeMB, uint32_t maxNumDBs, uint32_t maxNumReaders);
    LMDBEnvironment(const LMDBEnvironment& other) = delete;
    LMDBEnvironment(LMDBEnvironment&& other) = delete;
    LMDBEnvironment& operator=(const LMDBEnvironment& other) = delete;
    LMDBEnvironment& operator=(LMDBEnvironment&& other) = delete;

    ~LMDBEnvironment() { call_lmdb_func(mdb_env_close, _mdbEnv); }

    MDB_env* underlying() const { return _mdbEnv; }

    void waitForReader();

    void releaseReader();

  private:
    MDB_env* _mdbEnv;
    uint32_t _maxReaders;
    uint32_t _numReaders;
    std::mutex _readersLock;
    std::condition_variable _readersCondition;
};

class LMDBDatabase;

class LMDBTransaction {
  public:
    LMDBTransaction(LMDBEnvironment& env, bool readOnly = false)
        : _environment(env)
    {
        MDB_txn* p = nullptr;
        if (!call_lmdb_func(mdb_txn_begin, _environment.underlying(), p, readOnly ? MDB_RDONLY : 0U, &_transaction)) {
        }
    }
    LMDBTransaction(const LMDBTransaction& other) = delete;
    LMDBTransaction(LMDBTransaction&& other) = delete;
    LMDBTransaction& operator=(const LMDBTransaction& other) = delete;
    LMDBTransaction& operator=(LMDBTransaction&& other) = delete;

    virtual ~LMDBTransaction() = default;

    MDB_txn* underlying() const { return _transaction; }

  protected:
    LMDBEnvironment& _environment;
    MDB_txn* _transaction;
};

class LMDBDatabase {
  public:
    LMDBDatabase(const LMDBEnvironment& env,
                 const LMDBTransaction& transaction,
                 const std::string& name,
                 bool integerKeys = false,
                 bool reverseKeys = false,
                 MDB_cmp_func* cmp = nullptr)
        : _environment(env)
    {
        unsigned int flags = MDB_CREATE;
        if (integerKeys) {
            flags |= MDB_INTEGERKEY;
        }
        if (reverseKeys) {
            flags |= MDB_REVERSEKEY;
        }
        if (!call_lmdb_func(mdb_dbi_open, transaction.underlying(), name.c_str(), flags, &_dbi)) {
            // throw here
        }
        if (cmp != nullptr) {
            if (!call_lmdb_func(mdb_set_compare, transaction.underlying(), _dbi, cmp)) {
                // throw here
            }
        }
    }

    LMDBDatabase(const LMDBDatabase& other) = delete;
    LMDBDatabase(LMDBDatabase&& other) = delete;
    LMDBDatabase& operator=(const LMDBDatabase& other) = delete;
    LMDBDatabase& operator=(LMDBDatabase&& other) = delete;

    ~LMDBDatabase() { call_lmdb_func(mdb_dbi_close, _environment.underlying(), _dbi); }

    const MDB_dbi& underlying() const { return _dbi; }

  private:
    MDB_dbi _dbi;
    const LMDBEnvironment& _environment;
};

class LMDBReadTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBReadTransaction>;

    LMDBReadTransaction(LMDBEnvironment& env, const LMDBDatabase& database)
        : LMDBTransaction(env, true)
        , _database(database)
    {}
    LMDBReadTransaction(const LMDBReadTransaction& other) = delete;
    LMDBReadTransaction(LMDBReadTransaction&& other) = delete;
    LMDBReadTransaction& operator=(const LMDBReadTransaction& other) = delete;
    LMDBReadTransaction& operator=(LMDBReadTransaction&& other) = delete;

    ~LMDBReadTransaction() override { abort(); }

    template <typename T> bool get_value_or_previous(T& key, std::vector<uint8_t>& data) const;

    bool get_node(uint32_t level, index_t index, std::vector<uint8_t>& data) const;

    template <typename T> bool get_value_by_integer(T& key, std::vector<uint8_t>& data) const;

    bool get_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data) const;

  protected:
    const LMDBDatabase& _database;

    void abort()
    {
        call_lmdb_func(mdb_txn_abort, _transaction);
        _environment.releaseReader();
    }
};

template <typename T> bool LMDBReadTransaction::get_value_by_integer(T& key, std::vector<uint8_t>& data) const
{
    MDB_val dbKey;
    dbKey.mv_size = sizeof(T);
    dbKey.mv_data = (void*)&key;

    MDB_val dbVal;
    if (!call_lmdb_func(mdb_get, underlying(), _database.underlying(), &dbKey, &dbVal)) {
        return false;
    }
    data.resize(dbVal.mv_size);
    std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
    return true;
}

template <typename T> bool LMDBReadTransaction::get_value_or_previous(T& key, std::vector<uint8_t>& data) const
{
    T keyCopy = key;
    MDB_cursor* cursor = nullptr;
    call_lmdb_func(mdb_cursor_open, underlying(), _database.underlying(), &cursor);

    MDB_val dbKey;
    dbKey.mv_size = sizeof(T);
    dbKey.mv_data = (void*)&keyCopy;

    MDB_val dbVal;

    bool success = false;

    // Look for the key >= to that provided
    int code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_SET_RANGE);
    if (code == 0) {
        // we found the key, now determine if it is the exact key
        if (dbKey.mv_size == sizeof(T) && std::memcmp(dbKey.mv_data, &key, dbKey.mv_size) == 0) {
            // we have the exact key
            data.resize(dbVal.mv_size);
            std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
            success = true;
        } else {
            // We have a key of the same size but larger value OR a larger size
            // either way we now need to find the previous key
            code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);
            if (code == 0) {
                // We have found a previous key. It could be of the same size but smaller value, or smaller size which
                // is equal to not found
                if (dbKey.mv_size != sizeof(T)) {
                    // There is no previous key, do nothing
                } else {
                    data.resize(dbVal.mv_size);
                    std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
                    std::memcpy(&key, dbKey.mv_data, dbKey.mv_size);
                    success = true;
                }
            } else if (code == MDB_NOTFOUND) {
                // There is no previous key, do nothing
            } else {
                std::stringstream ss;
                ss << "ERROR: " << mdb_strerror(code) << std::endl;
                std::cout << ss.str();
            }
        }
    } else if (code == MDB_NOTFOUND) {
        // The key was not found, use the last key in the db
        code = mdb_cursor_get(cursor, &dbKey, &dbVal, MDB_PREV);
        if (code == 0) {
            // We found the last key, but we need to ensure it is the same size
            if (dbKey.mv_size != sizeof(T)) {
                // The key is not the same size, same as not found, do nothing
            } else {
                data.resize(dbVal.mv_size);
                std::memcpy(&data[0], dbVal.mv_data, dbVal.mv_size);
                std::memcpy(&key, dbKey.mv_data, dbKey.mv_size);
                success = true;
            }
        } else if (code == MDB_NOTFOUND) {
            // DB is empty?
        } else {
            std::stringstream ss;
            ss << "ERROR: " << mdb_strerror(code) << std::endl;
            std::cout << ss.str();
        }
    } else {
        std::stringstream ss;
        ss << "ERROR: " << mdb_strerror(code) << std::endl;
        std::cout << ss.str();
    }
    call_lmdb_func(mdb_cursor_close, cursor);
    return success;
}

class LMDBWriteTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBWriteTransaction>;

    LMDBWriteTransaction(LMDBEnvironment& env, const LMDBDatabase& database)
        : LMDBTransaction(env)
        , _database(database)
    {}
    LMDBWriteTransaction(const LMDBWriteTransaction& other) = delete;
    LMDBWriteTransaction(LMDBWriteTransaction&& other) = delete;
    LMDBWriteTransaction& operator=(const LMDBWriteTransaction& other) = delete;
    LMDBWriteTransaction& operator=(LMDBWriteTransaction&& other) = delete;
    ~LMDBWriteTransaction() override { commit(); }

    void put_node(uint32_t level, index_t index, std::vector<uint8_t>& data);

    template <typename T> void put_value_by_integer(T& key, std::vector<uint8_t>& data);

    void put_value(std::vector<uint8_t>& key, std::vector<uint8_t>& data);

    bool commit()
    {
        if (_committed) {
            return true;
        }
        _committed = call_lmdb_func(mdb_txn_commit, _transaction);
        return _committed;
    }

  protected:
    const LMDBDatabase& _database;
    bool _committed{};
};

template <typename T> void LMDBWriteTransaction::put_value_by_integer(T& key, std::vector<uint8_t>& data)
{
    MDB_val dbKey;
    dbKey.mv_size = sizeof(T);
    dbKey.mv_data = &key;

    MDB_val dbVal;
    dbVal.mv_size = data.size();
    dbVal.mv_data = (void*)data.data();
    call_lmdb_func(mdb_put, underlying(), _database.underlying(), &dbKey, &dbVal, 0U);
}

class LMDBDatabaseCreationTransaction : public LMDBTransaction {
  public:
    using Ptr = std::unique_ptr<LMDBDatabaseCreationTransaction>;

    LMDBDatabaseCreationTransaction(LMDBEnvironment& env)
        : LMDBTransaction(env)
    {}
    LMDBDatabaseCreationTransaction(const LMDBDatabaseCreationTransaction& other) = delete;
    LMDBDatabaseCreationTransaction(LMDBDatabaseCreationTransaction&& other) = delete;
    LMDBDatabaseCreationTransaction& operator=(const LMDBDatabaseCreationTransaction& other) = delete;
    LMDBDatabaseCreationTransaction& operator=(LMDBDatabaseCreationTransaction&& other) = delete;

    ~LMDBDatabaseCreationTransaction() override { commit(); }

  private:
    bool commit() { return call_lmdb_func(mdb_txn_commit, _transaction); }
};

class LMDBStore {

  public:
    using ReadTransaction = LMDBReadTransaction;
    using WriteTransaction = LMDBWriteTransaction;
    LMDBStore(LMDBEnvironment& environment,
              std::string name,
              bool integerKeys = false,
              bool reverseKeys = false,
              MDB_cmp_func* cmp = nullptr)
        : _environment(environment)
        , _name(std::move(name))
        , _database(_environment, LMDBDatabaseCreationTransaction(_environment), _name, integerKeys, reverseKeys, cmp)
    {}
    LMDBStore(const LMDBStore& other) = delete;
    LMDBStore(LMDBStore&& other) = delete;
    LMDBStore& operator=(const LMDBStore& other) = delete;
    LMDBStore& operator=(LMDBStore&& other) = delete;
    ~LMDBStore() = default;

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
} // namespace bb::crypto::merkle_tree