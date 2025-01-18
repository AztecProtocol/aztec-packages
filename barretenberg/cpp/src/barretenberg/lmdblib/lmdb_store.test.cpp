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

    auto key = serialise(std::string("Key"));
    auto data = serialise(std::string("TestData"));
    KeyDupValuesVector toWrite = { { { key, { data } } } };
    KeyDupValuesVector toDelete;
    EXPECT_NO_THROW(store->put(toWrite, toDelete, name));
}

TEST_F(LMDBStoreTest, can_write_duplicate_keys_to_database)
{
    LMDBStore::Ptr store = create_store(2);
    const std::string name = "Test Database";
    store->open_database(name);
    const std::string nameDups = "Test Database Dups";
    store->open_database(nameDups, true);

    auto key = serialise(std::string("Key"));
    auto data = serialise(std::string("TestData"));
    auto dataDup = serialise(std::string("TestData2"));
    KeyDupValuesVector toWrite = { { { key, { data, dataDup } } } };
    KeyDupValuesVector toDelete;
    EXPECT_NO_THROW(store->put(toWrite, toDelete, name));
    EXPECT_NO_THROW(store->put(toWrite, toDelete, nameDups));
}

TEST_F(LMDBStoreTest, can_read_from_database)
{
    LMDBStore::Ptr store = create_store();
    const std::string dbName = "Test Database";
    store->open_database(dbName);

    auto key = serialise(std::string("Key"));
    auto expected = serialise(std::string("TestData"));
    KeyDupValuesVector toWrite = { { { key, { expected } } } };
    KeyDupValuesVector toDelete;
    store->put(toWrite, toDelete, dbName);

    OptionalValuesVector data;
    KeysVector keys = { { key } };
    store->get(keys, data, dbName);
    EXPECT_EQ(data.size(), 1);
    EXPECT_TRUE(data[0].has_value());
    EXPECT_EQ(data[0].value(), ValuesVector{ expected });
}

TEST_F(LMDBStoreTest, can_write_and_read_multiple)
{
    LMDBStore::Ptr store = create_store(2);

    const std::vector<std::string> dbNames = { "Test Database 1", "Test Database 2" };
    for (const auto& s : dbNames) {
        EXPECT_NO_THROW(store->open_database(s));
    }

    uint64_t numValues = 10;

    {
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (uint64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            ValuesVector dup = { data };
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbNames[0]);
        store->put(toWrite, toDelete, dbNames[1]);
    }

    {
        KeysVector keys;
        OptionalValuesVector values;
        for (uint64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto expected = serialise((std::stringstream() << "TestData" << count).str());
            keys.push_back(key);
            values.emplace_back(ValuesVector{ expected });
        }

        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbNames[0]);
            EXPECT_EQ(retrieved.size(), numValues);
            EXPECT_EQ(retrieved, values);
        }
        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbNames[1]);
            EXPECT_EQ(retrieved.size(), numValues);
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

    uint64_t numValues = 1;
    uint64_t numDups = 2;

    {
        // This write multiple keys and multiple values against each key
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (uint64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (uint64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbNames[0]);
        store->put(toWrite, toDelete, dbNames[1]);
    }

    {
        KeysVector keys;
        OptionalValuesVector valuesWithoutDups;
        OptionalValuesVector valuesWithDups;
        for (uint64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            // For the no dup DB we expect the last written value to be present
            auto expectedNoDup = serialise((std::stringstream() << "TestData" << numDups - 1).str());
            keys.push_back(key);
            ValuesVector dup;
            for (uint64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto expectedWithDup = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(expectedWithDup);
            }
            valuesWithDups.emplace_back(dup);
            valuesWithoutDups.emplace_back(ValuesVector{ expectedNoDup });
        }

        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbNames[0]);
            EXPECT_EQ(retrieved.size(), numValues);
            EXPECT_EQ(retrieved, valuesWithoutDups);
        }
        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbNames[1]);
            EXPECT_EQ(retrieved.size(), numValues);
            EXPECT_EQ(retrieved, valuesWithDups);
        }
    }
}

TEST_F(LMDBStoreTest, can_read_missing_keys_from_database)
{
    LMDBStore::Ptr store = create_store();
    const std::string dbName = "Test Database";
    store->open_database(dbName);

    auto key = serialise(std::string("Key"));
    auto expected = serialise(std::string("TestData"));
    KeyDupValuesVector toWrite = { { { key, { expected } } } };
    KeyDupValuesVector toDelete;
    store->put(toWrite, toDelete, dbName);

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

    const std::vector<std::string> dbNames = { "Test Database 1", "Test Database 2" };
    for (const auto& s : dbNames) {
        store->open_database(s);
    }

    uint64_t numValues = 10;

    {
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (uint64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            ValuesVector dup = { data };
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbNames[0]);
    }

    {
        // Write 2 more and delete some
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (uint64_t count = numValues; count < numValues + 2; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            ValuesVector dup = { data };
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        for (uint64_t count = 3; count < numValues - 2; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            KeyValuesPair pair = { key, { data } };
            toDelete.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbNames[0]);
    }

    {
        KeysVector keys;
        OptionalValuesVector values;
        for (uint64_t count = 0; count < numValues + 2; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto expected = serialise((std::stringstream() << "TestData" << count).str());
            keys.push_back(key);
            values.emplace_back((count < 3 || count >= (numValues - 2)) ? OptionalValues(ValuesVector{ expected })
                                                                        : std::nullopt);
        }

        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbNames[0]);
            EXPECT_EQ(retrieved.size(), numValues + 2);
            EXPECT_EQ(retrieved, values);
        }
    }
}

TEST_F(LMDBStoreTest, can_write_and_delete_duplicates)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName, true);

    uint64_t numValues = 10;
    uint64_t numDups = 5;

    {
        // This write multiple keys and multiple values against each key
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (uint64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (uint64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbName);
    }

    {
        // Write 2 more and delete some
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (uint64_t count = numValues; count < numValues + 2; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (uint64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }

        // Remove some of the duplicate keys
        for (uint64_t count = 3; count < numValues - 2; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            // Remove some of the keys
            for (uint64_t dupCount = 1; dupCount < numDups - 1; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toDelete.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbName);
    }

    {
        KeysVector keys;
        OptionalValuesVector expectedValues;
        for (uint64_t count = 0; count < numValues + 2; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto expected = serialise((std::stringstream() << "TestData" << count).str());
            keys.push_back(key);
            uint64_t deletedDupStart = (count < 3 || count >= (numValues - 2)) ? numDups : 1;
            uint64_t deletedDupEnd = (count < 3 || count >= (numValues - 2)) ? 0 : numDups - 1;
            ValuesVector dup;
            // The number of keys retrieved depends on whether this key had some value deleted
            for (uint64_t dupCount = 0; dupCount < numDups; dupCount++) {
                if (dupCount >= deletedDupStart && dupCount < deletedDupEnd) {
                    continue;
                }
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            expectedValues.emplace_back(OptionalValues(ValuesVector{ dup }));
        }

        {
            OptionalValuesVector retrieved;
            store->get(keys, retrieved, dbName);
            EXPECT_EQ(retrieved.size(), numValues + 2);
            EXPECT_EQ(retrieved, expectedValues);
        }
    }
}

TEST_F(LMDBStoreTest, can_read_forwards_with_cursors)
{
    LMDBStore::Ptr store = create_store(2);

    const std::string dbName = "Test Database";
    store->open_database(dbName);

    int64_t numValues = 10;

    {
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (int64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            ValuesVector dup = { data };
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbName);
    }

    {
        // read from a key mid-way through
        int64_t startKey = 3;
        auto key = serialise((std::stringstream() << "Key" << startKey).str());
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t batchSize = 4;
        KeyDupValuesVector keyValues;
        cursor->read_next((uint64_t)batchSize, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count < startKey + batchSize; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
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

    uint64_t numValues = 10;
    uint64_t numDups = 5;

    {
        // This write multiple keys and multiple values against each key
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (uint64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (uint64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbName);
    }

    {
        // read from a key mid-way through
        int64_t startKey = 3;
        auto key = serialise((std::stringstream() << "Key" << startKey).str());
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t batchSize = 4;
        KeyDupValuesVector keyValues;
        cursor->read_next((uint64_t)batchSize, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count < startKey + batchSize; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (uint64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
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

    const std::vector<std::string> dbNames = { "Test Database 1", "Test Database 2" };
    for (const auto& s : dbNames) {
        store->open_database(s);
    }

    int64_t numValues = 10;

    {
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (int64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            ValuesVector dup = { data };
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbNames[0]);
    }

    {
        // read from a key mid-way through
        int64_t startKey = 7;
        auto key = serialise((std::stringstream() << "Key" << startKey).str());
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbNames[0]);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t batchSize = 4;
        KeyDupValuesVector keyValues;
        cursor->read_prev((uint64_t)batchSize, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count > startKey - batchSize; count--) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
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

    uint64_t numValues = 10;
    uint64_t numDups = 5;

    {
        // This write multiple keys and multiple values against each key
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (uint64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (uint64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbName);
    }

    {
        // read from a key mid-way through
        int64_t startKey = 7;
        auto key = serialise((std::stringstream() << "Key" << startKey).str());
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t batchSize = 4;
        KeyDupValuesVector keyValues;
        cursor->read_prev((uint64_t)batchSize, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count > startKey - batchSize; count--) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (uint64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
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

    int64_t numValues = 10;

    {
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (int64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            ValuesVector dup = { data };
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbName);
    }

    {
        // read from a key mid-way through
        int64_t startKey = 3;
        auto key = serialise((std::stringstream() << "Key" << startKey).str());
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t batchSize = 50;
        KeyDupValuesVector keyValues;
        cursor->read_next((uint64_t)batchSize, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
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

    int64_t numValues = 10;

    {
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (int64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            ValuesVector dup = { data };
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbName);
    }

    {
        // read from a key mid-way through
        int64_t startKey = 7;
        auto key = serialise((std::stringstream() << "Key" << startKey).str());
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t batchSize = 50;
        KeyDupValuesVector keyValues;
        cursor->read_prev((uint64_t)batchSize, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count >= 0; count--) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
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

    int64_t numValues = 10;
    int64_t numDups = 5;

    {
        // This write multiple keys and multiple values against each key
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (int64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbName);
    }

    {
        // read from a key mid-way through
        int64_t startKey = 3;
        auto key = serialise((std::stringstream() << "Key" << startKey).str());
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t batchSize = 50;
        KeyDupValuesVector keyValues;
        cursor->read_next((uint64_t)batchSize, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
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

    int64_t numValues = 10;
    int64_t numDups = 5;

    {
        // This write multiple keys and multiple values against each key
        KeyDupValuesVector toWrite;
        KeyDupValuesVector toDelete;
        for (int64_t count = 0; count < numValues; count++) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            toWrite.emplace_back(pair);
        }
        store->put(toWrite, toDelete, dbName);
    }

    {
        // read from a key mid-way through
        int64_t startKey = 7;
        auto key = serialise((std::stringstream() << "Key" << startKey).str());
        LMDBStore::ReadTransaction::SharedPtr tx = store->create_shared_read_transaction();
        LMDBStore::Cursor::Ptr cursor = store->create_cursor(tx, dbName);
        bool setResult = cursor->set_at_key(key);
        EXPECT_TRUE(setResult);

        int64_t batchSize = 50;
        KeyDupValuesVector keyValues;
        cursor->read_prev((uint64_t)batchSize, keyValues);

        KeyDupValuesVector expected;
        for (int64_t count = startKey; count >= 0; count--) {
            auto key = serialise((std::stringstream() << "Key" << count).str());
            ValuesVector dup;
            for (int64_t dupCount = 0; dupCount < numDups; dupCount++) {
                auto data = serialise((std::stringstream() << "TestData" << dupCount).str());
                dup.emplace_back(data);
            }
            KeyValuesPair pair = { key, dup };
            expected.emplace_back(pair);
        }
        EXPECT_EQ(keyValues, expected);
    }
}
