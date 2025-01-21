#include "barretenberg/lmdblib/lmdb_store.hpp"
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_db_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_store_base.hpp"
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>

namespace bb::lmdblib {
LMDBStore::LMDBStore(std::string directory, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs)
    : LMDBStoreBase(std::move(directory), mapSizeKb, maxNumReaders, maxDbs)
{}

void LMDBStore::open_database(const std::string& name, bool duplicateKeysPermitted)
{
    LMDBDatabase::SharedPtr db;
    {
        LMDBDatabaseCreationTransaction::Ptr tx = create_db_transaction();
        try {
            db = std::make_shared<LMDBDatabase>(_environment, *tx, name, false, false, duplicateKeysPermitted);
            tx->commit();
        } catch (std::exception& e) {
            tx->try_abort();
            throw std::runtime_error(format("Unable to create database: ", name, " Error: ", e.what()));
        }
    }
    // if we are here then we successfully created the database
    std::unique_lock<std::mutex> lock(databasesMutex);
    databases[name] = db;
}

void LMDBStore::close_database(const std::string& name)
{
    LMDBDatabase::SharedPtr db;
    {
        std::unique_lock<std::mutex> lock(databasesMutex);
        const auto it = databases.find(name);
        if (it == databases.end()) {
            throw std::runtime_error(format("Database ", name, " not found"));
        }
        db = it->second;
        databases.erase(it);
    }
}

LMDBStore::Database::SharedPtr LMDBStore::get_database(const std::string& name)
{
    std::unique_lock<std::mutex> lock(databasesMutex);
    const auto it = databases.find(name);
    if (it == databases.end()) {
        throw std::runtime_error(format("Database ", name, " not found"));
    }
    return it->second;
}

std::vector<LMDBStore::Database::SharedPtr> LMDBStore::get_databases() const
{
    std::unique_lock<std::mutex> lock(databasesMutex);
    std::vector<LMDBStore::Database::SharedPtr> dbs;
    dbs.reserve(databases.size());
    for (const auto& db : databases) {
        dbs.push_back(db.second);
    }
    return dbs;
}

uint64_t LMDBStore::get_stats(std::vector<DBStats>& stats) const
{
    std::vector<LMDBStore::Database::SharedPtr> dbs = get_databases();
    ReadTransaction::SharedPtr tx = create_read_transaction();
    for (const auto& db : dbs) {
        stats.push_back(db->get_stats(*tx));
    }
    return _environment->get_map_size();
}

void LMDBStore::put(KeyDupValuesVector& toWrite, KeyOptionalValuesVector& toDelete, const std::string& name)
{
    put(toWrite, toDelete, *get_database(name));
}
void LMDBStore::get(KeysVector& keys, OptionalValuesVector& values, const std::string& name)
{
    get(keys, values, get_database(name));
}

void LMDBStore::put(KeyDupValuesVector& toWrite, KeyOptionalValuesVector& toDelete, const LMDBDatabase& db)
{
    // lock used to ensure single write transaction
    LMDBWriteTransaction::Ptr tx = create_write_transaction();
    try {
        for (auto& kd : toWrite) {
            for (auto& p : kd.second) {
                tx->put_value(kd.first, p, db);
            }
        }
        for (auto& kd : toDelete) {
            if (!kd.second.has_value()) {
                tx->delete_value(kd.first, db);
                continue;
            }
            for (auto& p : kd.second.value()) {
                tx->delete_value(kd.first, p, db);
            }
        }
        tx->commit();
    } catch (std::exception& e) {
        tx->try_abort();
        throw std::runtime_error(format("Failed to commit data to ", db.name(), " Error: ", e.what()));
    }
}
void LMDBStore::get(KeysVector& keys, OptionalValuesVector& values, LMDBDatabase::SharedPtr db)
{
    values.reserve(keys.size());
    ReadTransaction::SharedPtr tx = create_read_transaction();
    if (!db->duplicate_keys_permitted()) {
        const LMDBDatabase& dbRef = *db;
        for (auto& k : keys) {
            OptionalValues optional;
            Value value;
            bool result = tx->get_value(k, value, dbRef);
            optional = result ? OptionalValues(ValuesVector{ value }) : std::nullopt;
            values.emplace_back(optional);
        }
        return;
    }
    {
        Cursor::Ptr cursor = std::make_unique<Cursor>(tx, db, _environment->getNextId());
        for (auto& k : keys) {
            if (!cursor->set_at_key(k)) {
                values.emplace_back(std::nullopt);
                continue;
            }
            KeyDupValuesVector keyValuePairs;
            cursor->read_next(1, keyValuePairs);
            if (keyValuePairs.empty()) {
                // this shouldn't happen but return the null optional anyway
                values.emplace_back(std::nullopt);
                continue;
            }
            ValuesVector retrievedValues;
            values.reserve(keyValuePairs.size());
            for (auto& kv : keyValuePairs) {
                for (auto& vals : kv.second) {
                    retrievedValues.push_back(std::move(vals));
                }
            }
            OptionalValues optionalValues = retrievedValues;
            values.emplace_back(optionalValues);
        }
    }
}

LMDBStore::Cursor::Ptr LMDBStore::create_cursor(ReadTransaction::SharedPtr tx, const std::string& dbName)
{
    Database::SharedPtr db = get_database(dbName);
    return std::make_unique<Cursor>(tx, db, _environment->getNextId());
}
} // namespace bb::lmdblib