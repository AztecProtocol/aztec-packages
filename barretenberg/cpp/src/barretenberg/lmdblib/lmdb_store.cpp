#include "barretenberg/lmdblib/lmdb_store.hpp"
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_db_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>

namespace bb::lmdblib {
LMDBStore::LMDBStore(std::string directory, uint64_t mapSizeKb, uint64_t maxNumReaders, uint64_t maxDbs)
    : dbDirectory(std::move(directory))
    , environment((std::make_shared<LMDBEnvironment>(dbDirectory, mapSizeKb, maxDbs, maxNumReaders)))
{}

void LMDBStore::open_database(const std::string& name, bool duplicateKeysPermitted)
{
    const auto it = databases.find(name);
    if (it != databases.end()) {
        return;
    }
    // lock used to ensure single write transaction
    std::unique_lock<std::mutex> lock(writersMtx);
    LMDBDatabaseCreationTransaction tx(environment);
    try {
        LMDBDatabase::SharedPtr db =
            std::make_shared<LMDBDatabase>(environment, tx, name, false, false, duplicateKeysPermitted);
        tx.commit();
        databases.emplace(name, db);
    } catch (std::exception& e) {
        tx.try_abort();
        throw std::runtime_error(format("Unable to create database: ", name, " Error: ", e.what()));
    }
}

void LMDBStore::put(KeyValuesVector& toWrite, KeysVector& toDelete, const std::string& name)
{
    put(toWrite, toDelete, *get_database(name));
}
void LMDBStore::get(KeysVector& keys, OptionalValuesVector& values, const std::string& name)
{
    get(keys, values, *get_database(name));
}

LMDBStore::Database::SharedPtr LMDBStore::get_database(const std::string& name)
{
    const auto it = databases.find(name);
    if (it == databases.end()) {
        throw std::runtime_error(format("Database ", name, " not found"));
    }
    return it->second;
}

void LMDBStore::put(KeyValuesVector& toWrite, KeysVector& toDelete, const LMDBDatabase& db)
{
    // lock used to ensure single write transaction
    std::unique_lock<std::mutex> lock(writersMtx);
    LMDBWriteTransaction tx(environment);
    try {
        for (auto& p : toWrite) {
            tx.put_value(p.first, p.second, db);
        }
        for (auto& d : toDelete) {
            tx.delete_value(d, db);
        }
        tx.commit();
    } catch (std::exception& e) {
        tx.try_abort();
        throw std::runtime_error(format("Failed to commit data to ", db.name(), " Error: ", e.what()));
    }
}
void LMDBStore::get(KeysVector& keys, OptionalValuesVector& values, const LMDBDatabase& db)
{
    values.reserve(keys.size());
    ReadTransaction::Ptr tx = create_read_transaction();
    for (auto& k : keys) {
        OptionalValue optional;
        Value value;
        bool result = tx->get_value(k, value, db);
        optional = result ? OptionalValue(value) : std::nullopt;
        values.emplace_back(optional);
    }
}

LMDBStore::ReadTransaction::Ptr LMDBStore::create_read_transaction()
{
    environment->wait_for_reader();
    return std::make_unique<LMDBReadTransaction>(environment);
}

LMDBStore::ReadTransaction::SharedPtr LMDBStore::create_shared_read_transaction()
{
    environment->wait_for_reader();
    return std::make_shared<LMDBReadTransaction>(environment);
}

LMDBStore::Cursor::Ptr LMDBStore::create_cursor(ReadTransaction::SharedPtr tx, const std::string& dbName)
{
    Database::SharedPtr db = get_database(dbName);
    return std::make_unique<Cursor>(tx, db, environment->getNextId());
}
} // namespace bb::lmdblib