#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <vector>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/lmdblib/fixtures.hpp"
#include "barretenberg/lmdblib/lmdb_cursor.hpp"
#include "barretenberg/lmdblib/lmdb_database.hpp"
#include "barretenberg/lmdblib/lmdb_db_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_environment.hpp"
#include "barretenberg/lmdblib/lmdb_read_transaction.hpp"
#include "barretenberg/lmdblib/lmdb_store.hpp"
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"
#include "barretenberg/lmdblib/queries.hpp"
#include "barretenberg/lmdblib/types.hpp"

using namespace bb::lmdblib;

class LMDBStoreTest : public testing::Test {
  protected:
    void SetUp() override
    {
        _directory = random_temp_directory();
        _mapSize = 1024 * 1024;
        _maxReaders = 16;
        std::filesystem::create_directories(_directory);
    }

    void TearDown() override { std::filesystem::remove_all(_directory); }

  public:
    static std::string _directory;
    static uint32_t _maxReaders;
    static uint64_t _mapSize;
};

std::string LMDBStoreTest::_directory;
uint32_t LMDBStoreTest::_maxReaders;
uint64_t LMDBStoreTest::_mapSize;

LMDBStore::Ptr create_store(uint32_t maxNumDbs = 1)
{
    return std::make_unique<LMDBStore>(
        LMDBStoreTest::_directory, LMDBStoreTest::_mapSize, LMDBStoreTest::_maxReaders, maxNumDbs);
}

void prepare_test_data(int64_t numKeys, int64_t numValues, KeyDupValuesVector& testData, int64_t keyOffset = 0)
{
    for (int64_t count = 0; count < numKeys; count++) {
        int64_t keyValue = keyOffset + count;
        auto key = get_key(keyValue);
        ValuesVector dup;
        for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
            auto data = get_value(keyValue, dupCount);
            dup.emplace_back(data);
        }
        KeyValuesPair pair = { key, dup };
        testData.emplace_back(pair);
    }
}

void write_test_data(std::vector<std::string> dbNames, int64_t numKeys, int64_t numValues, LMDBStore& store)
{
    KeyDupValuesVector toWrite;
    KeyOptionalValuesVector toDelete;
    prepare_test_data(numKeys, numValues, toWrite);
    for (auto& name : dbNames) {
        LMDBStore::PutData putData = { toWrite, toDelete, name };
        std::vector<LMDBStore::PutData> putDatas = { putData };
        store.put(putDatas);
    }
}

TEST_F(LMDBStoreTest, can_create_store)
{
    EXPECT_NO_THROW(LMDBStore store(LMDBStoreTest::_directory, LMDBStoreTest::_mapSize, LMDBStoreTest::_maxReaders, 1));
}

TEST_F(LMDBStoreTest, can_create_database)
{
    LMDBStore::Ptr store = create_store();
    const std::string name = "Test Database";
    EXPECT_NO_THROW(store->open_database(name));
}

TEST_F(LMDBStoreTest, can_not_create_more_databases_then_specified)
{
    LMDBStore::Ptr store = create_store(2);
    const std::string name1 = "Test Database 1";
    EXPECT_NO_THROW(store->open_database(name1));
    const std::string name2 = "Test Database 2";
    EXPECT_NO_THROW(store->open_database(name2));
    const std::string name3 = "Test Database 3";
    EXPECT_THROW(store->open_database(name3), std::runtime_error);
}

TEST_F(LMDBStoreTest, can_write_to_database)
{
    LMDBStore::Ptr store = create_store();
    const std::string name = "Test Database";
    store->open_database(name);

    auto key = get_key(0);
    auto data = get_value(0, 1);
    KeyDupValuesVector toWrite = { { { key, { data } } } };
    KeyOptionalValuesVector toDelete;
    LMDBStore::PutData putData = { toWrite, toDelete, name };
    std::vector<LMDBStore::PutData> putDatas = { putData };
    EXPECT_NO_THROW(store->put(putDatas));
}

TEST_F(LMDBStoreTest, can_not_write_to_database_that_does_not_exist)
{
    LMDBStore::Ptr store = create_store();
    const std::string name = "Test Database";
    store->open_database(name);

    auto key = get_key(0);
    auto data = get_value(0, 1);
    KeyDupValuesVector toWrite = { { { key, { data } } } };
    KeyOptionalValuesVector toDelete;
    LMDBStore::PutData putData = { toWrite, toDelete, "Non Existent Database" };
    std::vector<LMDBStore::PutData> putDatas = { putData };
    EXPECT_THROW(store->put(putDatas), std::runtime_error);
}

TEST_F(LMDBStoreTest, can_close_database)
{
    LMDBStore::Ptr store = create_store();
    const std::string name = "Test Database";
    store->open_database(name);

    auto key = get_key(0);
    auto data = get_value(0, 1);
    KeyDupValuesVector toWrite = { { { key, { data } } } };
    KeyOptionalValuesVector toDelete;
    LMDBStore::PutData putData = { toWrite, toDelete, name };
    std::vector<LMDBStore::PutData> putDatas = { putData };
    EXPECT_NO_THROW(store->put(putDatas));

    EXPECT_NO_THROW(store->close_database(name));

    // try another write
    key = get_key(1);
    data = get_value(1, 1);
    toWrite = { { { key, { data } } } };
    putData = { toWrite, toDelete, name };
    putDatas = { putData };
    EXPECT_THROW(store->put(putDatas), std::runtime_error);
}

TEST_F(LMDBStoreTest, can_write_duplicate_keys_to_database)
{
    LMDBStore::Ptr store = create_store(2);
    const std::string name = "Test Database";
    store->open_database(name);
    const std::string nameDups = "Test Database Dups";
    store->open_database(nameDups, true);

    // Write a key multiple times with different values
    auto key = get_key(0);
    auto data = get_value(0, 1);
    auto dataDup = get_value(0, 2);
    KeyDupValuesVector toWrite = { { { key, { data, dataDup } } } };
    KeyOptionalValuesVector toDelete;
    LMDBStore::PutData putData = { toWrite, toDelete, name };
    std::vector<LMDBStore::PutData> putDatas = { putData };
    EXPECT_NO_THROW(store->put(putDatas));
    LMDBStore::PutData putDataDups = { toWrite, toDelete, nameDups };
    putDatas = { putDataDups };
    EXPECT_NO_THROW(store->put(putDatas));
}

TEST_F(LMDBStoreTest, can_read_from_database)
{
    LMDBStore::Ptr store = create_store();
    const std::string dbName = "Test Database";
    store->open_database(dbName);

    auto key = get_key(0);
    auto expected = get_value(0, 1);
    KeyDupValuesVector toWrite = { { { key, { expected } } } };
    KeyOptionalValuesVector toDelete;
    LMDBStore::PutData putData = { toWrite, toDelete, dbName };
    std::vector<LMDBStore::PutData> putDatas = { putData };
    store->put(putDatas);

    OptionalValuesVector data;
    KeysVector keys = { { key } };
    store->get(keys, data, dbName);
    EXPECT_EQ(data.size(), 1);
    EXPECT_TRUE(data[0].has_value());
    EXPECT_EQ(data[0].value(), ValuesVector{ expected });
}

TEST_F(LMDBStoreTest, can_not_read_from_non_existent_database)
{
    LMDBStore::Ptr store = create_store();
    const std::string dbName = "Test Database";
    store->open_database(dbName);

    auto key = get_key(0);
    auto expected = get_value(0, 1);
    KeyDupValuesVector toWrite = { { { key, { expected } } } };
    KeyOptionalValuesVector toDelete;
    LMDBStore::PutData putData = { toWrite, toDelete, dbName };
    std::vector<LMDBStore::PutData> putDatas = { putData };
    store->put(putDatas);

    OptionalValuesVector data;
    KeysVector keys = { { key } };
    EXPECT_THROW(store->get(keys, data, "Non Existent Database"), std::runtime_error);
}

TEST_F(LMDBStoreTest, can_write_and_read_multiple)
{
    LMDBStore::Ptr store = create_store(2);

    const std::vector<std::string> dbNames = { "Test Database 1", "Test Database 2" };
    for (const auto& s : dbNames) {
        EXPECT_NO_THROW(store->open_database(s));
    }

    // We will write to multiple databases and read back from them both
    int64_t numKeys = 10;
    int64_t numValues = 1;

    write_test_data(dbNames, numKeys, numValues, *store);

    {
        KeysVector keys;
        OptionalValuesVector values;
        for (int64_t count = 0; count < numKeys; count++) {
            auto key = get_key(count);
            auto expected = get_value(count, 0);
            keys.push_back(key);
            values.emplace_back(ValuesVector{ expected });
        }

        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbNames[0]);
            EXPECT_EQ(retrieved.size(), numKeys);
            EXPECT_EQ(retrieved, values);
        }
        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbNames[1]);
            EXPECT_EQ(retrieved.size(), numKeys);
            EXPECT_EQ(retrieved, values);
        }
    }
}

TEST_F(LMDBStoreTest, can_write_and_read_multiple_duplicates)
{
    LMDBStore::Ptr store = create_store(2);

    const std::vector<std::string> dbNames = { "Test Database No Dups", "Test Database Dups" };
    store->open_database(dbNames[0], false);
    store->open_database(dbNames[1], true);

    // We will write multiple values to the same key
    // Depending on whether the database supports duplicates determines if
    // we append or overwrite
    int64_t numKeys = 1;
    int64_t numValues = 2;

    write_test_data(dbNames, numKeys, numValues, *store);

    {
        KeysVector keys;
        OptionalValuesVector valuesWithoutDups;
        OptionalValuesVector valuesWithDups;
        for (int64_t count = 0; count < numKeys; count++) {
            auto key = get_key(count);
            // For the no dup DB we expect the last written value to be present
            auto expectedNoDup = get_value(count, numValues - 1);
            keys.push_back(key);
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
                auto expectedWithDup = get_value(count, dupCount);
                dup.emplace_back(expectedWithDup);
            }
            valuesWithDups.emplace_back(dup);
            valuesWithoutDups.emplace_back(ValuesVector{ expectedNoDup });
        }

        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbNames[0]);
            EXPECT_EQ(retrieved.size(), numKeys);
            EXPECT_EQ(retrieved, valuesWithoutDups);
        }
        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbNames[1]);
            EXPECT_EQ(retrieved.size(), numKeys);
            EXPECT_EQ(retrieved, valuesWithDups);
        }
    }
}

TEST_F(LMDBStoreTest, can_read_missing_keys_from_database)
{
    LMDBStore::Ptr store = create_store();
    const std::string dbName = "Test Database";
    store->open_database(dbName);

    // We will attempt to read a non-existant key and see that it returns nothing

    auto key = get_key(0);
    auto expected = get_value(0, 0);
    KeyDupValuesVector toWrite = { { { key, { expected } } } };
    KeyOptionalValuesVector toDelete;
    LMDBStore::PutData putData = { toWrite, toDelete, dbName };
    std::vector<LMDBStore::PutData> putDatas = { putData };
    store->put(putDatas);

    OptionalValuesVector data;
    auto missing = serialise(std::string("Missing Key"));
    KeysVector keys = { { key }, { missing } };
    store->get(keys, data, dbName);
    EXPECT_EQ(data.size(), 2);
    EXPECT_TRUE(data[0].has_value());
    EXPECT_EQ(data[0].value(), ValuesVector{ expected });
    EXPECT_FALSE(data[1].has_value());
}

TEST_F(LMDBStoreTest, can_write_and_delete)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName);

    // Test writing and deleting items from the database

    int64_t numKeys = 10;
    int64_t numValues = 1;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // Write 2 more and delete some
        KeyDupValuesVector toWrite;
        KeyOptionalValuesVector toDelete;
        for (int64_t count = numKeys; count < numKeys + 2; count++) {
            auto key = get_key(count);
            auto data = get_value(count, 0);
            ValuesVector dup = { data };
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        for (int64_t count = 3; count < numKeys - 2; count++) {
            auto key = get_key(count);
            auto data = get_value(count, 0);
            KeyValuesPair pair = { key, { data } };
            toDelete.emplace_back(pair);
        }
        LMDBStore::PutData putData = { toWrite, toDelete, dbName };
        std::vector<LMDBStore::PutData> putDatas = { putData };
        store->put(putDatas);
    }

    {
        KeysVector keys;
        OptionalValuesVector values;
        for (int64_t count = 0; count < numKeys + 2; count++) {
            auto key = get_key(count);
            auto expected = get_value(count, 0);
            keys.push_back(key);
            values.emplace_back((count < 3 || count >= (numKeys - 2)) ? OptionalValues(ValuesVector{ expected })
                                                                      : std::nullopt);
        }

        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbName);
            EXPECT_EQ(retrieved.size(), numKeys + 2);
            EXPECT_EQ(retrieved, values);
        }
    }
}

TEST_F(LMDBStoreTest, can_write_and_delete_duplicates)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    // Test writing and deleting entries from a database supporting duplicates

    int64_t numKeys = 10;
    int64_t numValues = 5;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // Write 2 more and delete some
        KeyDupValuesVector toWrite;
        KeyOptionalValuesVector toDelete;
        for (int64_t count = numKeys; count < numKeys + 2; count++) {
            auto key = get_key(count);
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
                auto data = get_value(count, dupCount);
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }

        // For some keys we remove some of the values
        for (int64_t count = 3; count < numKeys - 2; count++) {
            auto key = get_key(count);
            ValuesVector dup;
            // Remove some of the values
            for (int64_t dupCount = 1; dupCount < numValues - 1; dupCount++) {
                auto data = get_value(count, dupCount);
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toDelete.emplace_back(pair);
        }
        LMDBStore::PutData putData = { toWrite, toDelete, dbName };
        std::vector<LMDBStore::PutData> putDatas = { putData };
        store->put(putDatas);
    }

    {
        KeysVector keys;
        OptionalValuesVector expectedValues;
        for (int64_t count = 0; count < numKeys + 2; count++) {
            auto key = get_key(count);
            keys.push_back(key);
            int64_t deletedDupStart = (count < 3 || count >= (numKeys - 2)) ? numValues : 1;
            int64_t deletedDupEnd = (count < 3 || count >= (numKeys - 2)) ? 0 : numValues - 1;
            ValuesVector dup;
            // The number of keys retrieved depends on whether this key had some value deleted
            for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
                if (dupCount >= deletedDupStart && dupCount < deletedDupEnd) {
                    continue;
                }
                auto data = get_value(count, dupCount);
                dup.emplace_back(data);
            }
            expectedValues.emplace_back(OptionalValues(ValuesVector{ dup }));
        }

        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbName);
            EXPECT_EQ(retrieved.size(), numKeys + 2);
            EXPECT_EQ(retrieved, expectedValues);
        }
    }
}

TEST_F(LMDBStoreTest, can_delete_all_values_from_keys)
{
    LMDBStore::Ptr store = create_store(2);

    const std::vector<std::string> dbNames = { "Test Database No Dups", "Test Database Dups" };
    store->open_database(dbNames[0], false);
    store->open_database(dbNames[1], true);

    // Test writing and deleting entries from a database supporting duplicates

    int64_t numKeys = 10;
    int64_t numValues = 5;

    write_test_data(dbNames, numKeys, numValues, *store);

    KeyDupValuesVector toWrite;
    KeyOptionalValuesVector toDelete;
    for (int64_t count = 3; count < numKeys - 2; count++) {
        auto key = get_key(count);
        KeyOptionalValuesPair pair = { key, std::nullopt };
        toDelete.emplace_back(pair);
    }
    LMDBStore::PutData putData1 = { toWrite, toDelete, dbNames[0] };
    LMDBStore::PutData putData2 = { toWrite, toDelete, dbNames[1] };
    std::vector<LMDBStore::PutData> putDatas = { putData1, putData2 };
    store->put(putDatas);
    // read all the key/value pairs
    {
        // We first read the database that supports duplicates
        KeysVector keys;
        KeyDupValuesVector expectedValues;
        for (int64_t count = 0; count < numKeys; count++) {
            if (count >= 3 && count < numKeys - 2) {
                continue;
            }
            auto key = get_key(count);
            keys.push_back(key);
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
                auto data = get_value(count, dupCount);
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            expectedValues.emplace_back(pair);
        }
        LMDBStore::ReadTransaction::SharedPtr readTransaction = store->create_shared_read_transaction();
        LMDBCursor::Ptr cursor = store->create_cursor(readTransaction, dbNames[1]);
        cursor->set_at_start();

        KeyDupValuesVector retrieved;
        cursor->read_next((uint64_t)numKeys, retrieved);
        EXPECT_EQ(retrieved, expectedValues);
    }

    {
        // Now read the database without duplicates
        KeysVector keys;
        KeyDupValuesVector expectedValues;
        for (int64_t count = 0; count < numKeys; count++) {
            if (count >= 3 && count < numKeys - 2) {
                continue;
            }
            auto key = get_key(count);
            keys.push_back(key);
            ValuesVector dup(1, get_value(count, numValues - 1));
            KeyValuesPair pair = { key, dup };
            expectedValues.emplace_back(pair);
        }
        LMDBStore::ReadTransaction::SharedPtr readTransaction = store->create_shared_read_transaction();
        LMDBCursor::Ptr cursor = store->create_cursor(readTransaction, dbNames[0]);
        cursor->set_at_start();

        KeyDupValuesVector retrieved;
        cursor->read_next((uint64_t)numKeys, retrieved);
        EXPECT_EQ(retrieved, expectedValues);
    }
}

TEST_F(LMDBStoreTest, can_read_forwards_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName);

    int64_t numKeys = 10;
    int64_t numValues = 1;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read from a key mid-way through
        int64_t startKey = 3;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 4;
        KeyDupValuesVector keyValues;
        cursor->read_next((uint64_t)numKeysToRead, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count < startKey + numKeysToRead; count++) {
            auto key = get_key(count);
            auto data = get_value(count, 0);
            expected.emplace_back(KeyValuesPair{ key, { data } });
        }
        EXPECT_EQ(keyValues, expected);
    }
}

TEST_F(LMDBStoreTest, can_read_duplicate_values_forwards_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    int64_t numKeys = 10;
    int64_t numValues = 5;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read from a key mid-way through
        int64_t startKey = 3;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 4;
        KeyDupValuesVector keyValues;
        cursor->read_next((uint64_t)numKeysToRead, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count < startKey + numKeysToRead; count++) {
            auto key = get_key(count);
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
                auto data = get_value(count, dupCount);
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            expected.emplace_back(pair);
        }
        EXPECT_EQ(keyValues, expected);
    }
}

TEST_F(LMDBStoreTest, can_read_backwards_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    int64_t numKeys = 10;
    int64_t numValues = 1;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read from a key mid-way through
        int64_t startKey = 7;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 4;
        KeyDupValuesVector keyValues;
        cursor->read_prev((uint64_t)numKeysToRead, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count > startKey - numKeysToRead; count--) {
            auto key = get_key(count);
            auto data = get_value(count, 0);
            expected.emplace_back(KeyValuesPair{ key, { data } });
        }
        EXPECT_EQ(keyValues, expected);
    }
}

TEST_F(LMDBStoreTest, can_read_duplicate_values_backwards_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    int64_t numKeys = 10;
    int64_t numValues = 5;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read from a key mid-way through
        int64_t startKey = 7;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 4;
        KeyDupValuesVector keyValues;
        cursor->read_prev((uint64_t)numKeysToRead, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count > startKey - numKeysToRead; count--) {
            auto key = get_key(count);
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
                auto data = get_value(count, dupCount);
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            expected.emplace_back(pair);
        }
        EXPECT_EQ(keyValues, expected);
    }
}

TEST_F(LMDBStoreTest, can_read_past_the_end_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, false);

    int64_t numKeys = 10;
    int64_t numValues = 1;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read from a key mid-way through
        int64_t startKey = 3;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 50;
        KeyDupValuesVector keyValues;
        cursor->read_next((uint64_t)numKeysToRead, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count < numKeys; count++) {
            auto key = get_key(count);
            auto data = get_value(count, 0);
            expected.emplace_back(KeyValuesPair{ key, { data } });
        }
        EXPECT_EQ(keyValues, expected);
    }
}

TEST_F(LMDBStoreTest, can_read_past_the_start_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, false);

    int64_t numKeys = 10;
    int64_t numValues = 1;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read from a key mid-way through
        int64_t startKey = 7;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 50;
        KeyDupValuesVector keyValues;
        cursor->read_prev((uint64_t)numKeysToRead, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count >= 0; count--) {
            auto key = get_key(count);
            auto data = get_value(count, 0);
            expected.emplace_back(KeyValuesPair{ key, { data } });
        }
        EXPECT_EQ(keyValues, expected);
    }
}

TEST_F(LMDBStoreTest, can_read_duplicates_past_the_end_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    int64_t numKeys = 10;
    int64_t numValues = 5;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read from a key mid-way through
        int64_t startKey = 3;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 50;
        KeyDupValuesVector keyValues;
        cursor->read_next((uint64_t)numKeysToRead, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count < numKeys; count++) {
            auto key = get_key(count);
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
                auto data = get_value(count, dupCount);
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            expected.emplace_back(pair);
        }
        EXPECT_EQ(keyValues, expected);
    }
}

TEST_F(LMDBStoreTest, can_read_duplicates_past_the_start_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    int64_t numKeys = 10;
    int64_t numValues = 5;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read from a key mid-way through
        int64_t startKey = 7;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 50;
        KeyDupValuesVector keyValues;
        cursor->read_prev((uint64_t)numKeysToRead, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count >= 0; count--) {
            auto key = get_key(count);
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
                auto data = get_value(count, dupCount);
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            expected.emplace_back(pair);
        }
        EXPECT_EQ(keyValues, expected);
    }
}

TEST_F(LMDBStoreTest, can_read_in_both_directions_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    int64_t numKeys = 10;
    int64_t numValues = 5;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read backwards from a key mid-way through
        int64_t startKey = 7;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 4;
        KeyDupValuesVector keyValuesReverse;
        cursor->read_prev((uint64_t)numKeysToRead, keyValuesReverse);

        // now read forwards using the same cursor
        startKey = (startKey - numKeysToRead) + 1;
        key = get_key(startKey);
        setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);
        KeyDupValuesVector keyValues;
        cursor->read_next((uint64_t)numKeysToRead, keyValues);

        // Ensure the data returned by the reverse operation matches that returned by the forwards operation
        KeyDupValuesVector temp(keyValuesReverse.rbegin(), keyValuesReverse.rend());
        EXPECT_EQ(temp, keyValues);
    }
}

TEST_F(LMDBStoreTest, can_use_multiple_cursors_with_same_tx)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    int64_t numKeys = 10;
    int64_t numValues = 5;

    write_test_data({ dbName }, numKeys, numValues, *store);

    {
        // read backwards from a key mid-way through
        int64_t startKey = 7;
        auto key = get_key(startKey);
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t numKeysToRead = 4;
        KeyDupValuesVector keyValuesReverse;
        cursor->read_prev((uint64_t)numKeysToRead, keyValuesReverse);

        // now read forwards using a second cursor against the same transaction
        LMDBStore::Cursor::Ptr cursor2 = store->create_cursor(tx, dbName);
        startKey = (startKey - numKeysToRead) + 1;

        key = get_key(startKey);
        setResult = cursor2->set_at_key(key);
        EXPECT_TRUE(setResult);

        KeyDupValuesVector keyValues;
        cursor2->read_next((uint64_t)numKeysToRead, keyValues);

        KeyDupValuesVector temp(keyValuesReverse.rbegin(), keyValuesReverse.rend());
        EXPECT_EQ(temp, keyValues);
    }
}

TEST_F(LMDBStoreTest, can_write_and_delete_many_times)
{
    LMDBStore::Ptr store = create_store(2);

    const std::vector<std::string> dbNames = { "Test Database No Dups", "Test Database Dups" };
    store->open_database(dbNames[0], false);
    store->open_database(dbNames[1], true);

    int64_t numKeys = 5000;
    int64_t numValues = 10;
    int64_t numIterations = 20;

    KeyOptionalValuesVector toDelete;
    for (int64_t i = 0; i < numIterations; i++) {
        KeyDupValuesVector testDataNoDuplicates;
        KeyDupValuesVector testDataDuplicates;
        prepare_test_data(numKeys, numValues, testDataDuplicates, i * numKeys);
        prepare_test_data(numKeys, 1, testDataNoDuplicates, i * numKeys);
        if (i > 0) {
            // delete all of the previous iteration's keys
            for (int64_t k = 0; k < numKeys; k++) {
                int64_t keyToDelete = ((i - 1) * numKeys) + k;
                toDelete.emplace_back(get_key(keyToDelete), std::nullopt);
            }
        }
        LMDBStore::PutData putData1 = { testDataNoDuplicates, toDelete, dbNames[0] };
        LMDBStore::PutData putData2 = { testDataDuplicates, toDelete, dbNames[1] };
        std::vector<LMDBStore::PutData> putDatas{ putData1, putData2 };
        EXPECT_NO_THROW(store->put(putDatas));
    }
}

TEST_F(LMDBStoreTest, reports_stats)
{
    LMDBStore::Ptr store = create_store(2);

    const std::vector<std::string> dbNames = { "Test Database No Dups", "Test Database Dups" };
    store->open_database(dbNames[0], false);
    store->open_database(dbNames[1], true);

    int64_t numKeys = 10;
    int64_t numValues = 5;

    write_test_data(dbNames, numKeys, numValues, *store);

    std::vector<DBStats> stats;
    uint64_t mapSize = store->get_stats(stats);
    EXPECT_EQ(mapSize, LMDBStoreTest::_mapSize * 1024);
    EXPECT_EQ(stats.size(), 2);
    for (size_t i = 0; i < 2; i++) {
        if (stats[i].name == dbNames[0]) {
            // The DB without duplicates should contain as many items as there are keys
            EXPECT_EQ(stats[i].numDataItems, numKeys);
        } else if (stats[i].name == dbNames[1]) {
            // The DB with duplicates should contain as keys * values number of items
            EXPECT_EQ(stats[i].numDataItems, numKeys * numValues);
        } else {
            FAIL();
        }
    }
}

TEST_F(LMDBStoreTest, can_read_data_from_multiple_threads)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    int64_t numKeys = 10;
    int64_t numValues = 5;
    int64_t numIterationsPerThread = 1000;
    uint64_t numThreads = 10;

    write_test_data({ dbName }, numKeys, numValues, *store);

    std::vector<std::thread> threads;
    {
        auto func = [&]() -> void {
            for (int64_t iteration = 0; iteration < numIterationsPerThread; iteration++) {
                for (int64_t count = 0; count < numKeys; count++) {
                    auto key = get_key(count);
                    LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
                    LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
                    cursor->set_at_key(key);
                    KeyDupValuesVector keyValuePairs;
                    cursor->read_next(1, keyValuePairs);

                    ValuesVector dup;
                    KeyDupValuesVector expected;
                    for (int64_t dupCount = 0; dupCount < numValues; dupCount++) {
                        auto data = get_value(count, dupCount);
                        dup.emplace_back(data);
                    }
                    KeyValuesPair pair = { key, dup };
                    expected.emplace_back(pair);
                    EXPECT_EQ(keyValuePairs, expected);
                }
            }
        };
        std::vector<std::unique_ptr<std::thread>> threads;
        for (uint64_t count = 0; count < numThreads; count++) {
            threads.emplace_back(std::make_unique<std::thread>(func));
        }
        for (uint64_t count = 0; count < numThreads; count++) {
            threads[count]->join();
        }
    }
}
