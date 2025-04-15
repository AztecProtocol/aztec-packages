#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <memory>
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
#include "barretenberg/lmdblib/lmdb_write_transaction.hpp"
#include "barretenberg/lmdblib/queries.hpp"

using namespace bb::lmdblib;

class LMDBEnvironmentTest : public testing::Test {
  protected:
    void SetUp() override
    {
        _directory = random_temp_directory();
        _mapSize = 1024 * 1024;
        _maxReaders = 16;
        std::filesystem::create_directories(_directory);
    }

    void TearDown() override { std::filesystem::remove_all(_directory); }

    static std::string _directory;
    static uint32_t _maxReaders;
    static uint64_t _mapSize;
};

std::string LMDBEnvironmentTest::_directory;
uint32_t LMDBEnvironmentTest::_maxReaders;
uint64_t LMDBEnvironmentTest::_mapSize;

TEST_F(LMDBEnvironmentTest, can_create_environment)
{
    EXPECT_NO_THROW(LMDBEnvironment environment(
        LMDBEnvironmentTest::_directory, LMDBEnvironmentTest::_mapSize, 1, LMDBEnvironmentTest::_maxReaders));
}

TEST_F(LMDBEnvironmentTest, can_create_database)
{
    LMDBEnvironment::SharedPtr environment = std::make_shared<LMDBEnvironment>(
        LMDBEnvironmentTest::_directory, LMDBEnvironmentTest::_mapSize, 1, LMDBEnvironmentTest::_maxReaders);

    {
        environment->wait_for_writer();
        LMDBDatabaseCreationTransaction tx(environment);
        LMDBDatabase::SharedPtr db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
        EXPECT_NO_THROW(tx.commit());
    }
}

TEST_F(LMDBEnvironmentTest, can_write_to_database)
{
    LMDBEnvironment::SharedPtr environment = std::make_shared<LMDBEnvironment>(
        LMDBEnvironmentTest::_directory, LMDBEnvironmentTest::_mapSize, 1, LMDBEnvironmentTest::_maxReaders);

    LMDBDatabase::SharedPtr db;
    {
        environment->wait_for_writer();
        LMDBDatabaseCreationTransaction tx(environment);
        db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
        EXPECT_NO_THROW(tx.commit());
    }

    {
        environment->wait_for_writer();
        LMDBWriteTransaction::Ptr tx = std::make_unique<LMDBWriteTransaction>(environment);
        auto key = get_key(0);
        auto data = get_value(0, 0);
        EXPECT_NO_THROW(tx->put_value(key, data, *db));
        EXPECT_NO_THROW(tx->commit());
    }
}

TEST_F(LMDBEnvironmentTest, can_read_from_database)
{
    LMDBEnvironment::SharedPtr environment = std::make_shared<LMDBEnvironment>(
        LMDBEnvironmentTest::_directory, LMDBEnvironmentTest::_mapSize, 1, LMDBEnvironmentTest::_maxReaders);
    LMDBDatabase::SharedPtr db;

    {
        environment->wait_for_writer();
        LMDBDatabaseCreationTransaction tx(environment);
        db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
        EXPECT_NO_THROW(tx.commit());
    }

    {
        environment->wait_for_writer();
        LMDBWriteTransaction::Ptr tx = std::make_unique<LMDBWriteTransaction>(environment);
        auto key = get_key(0);
        auto data = get_value(0, 0);
        EXPECT_NO_THROW(tx->put_value(key, data, *db));
        EXPECT_NO_THROW(tx->commit());
    }

    {
        environment->wait_for_reader();
        LMDBReadTransaction::Ptr tx = std::make_unique<LMDBReadTransaction>(environment);
        auto key = get_key(0);
        auto expected = get_value(0, 0);
        std::vector<uint8_t> data;
        tx->get_value(key, data, *db);
        EXPECT_EQ(data, expected);
    }
}

TEST_F(LMDBEnvironmentTest, can_write_and_read_multiple)
{
    LMDBEnvironment::SharedPtr environment = std::make_shared<LMDBEnvironment>(
        LMDBEnvironmentTest::_directory, LMDBEnvironmentTest::_mapSize, 1, LMDBEnvironmentTest::_maxReaders);

    LMDBDatabase::SharedPtr db;

    {
        environment->wait_for_writer();
        LMDBDatabaseCreationTransaction tx(environment);
        db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
        EXPECT_NO_THROW(tx.commit());
    }

    int64_t numValues = 10;

    {
        for (int64_t count = 0; count < numValues; count++) {
            environment->wait_for_writer();
            LMDBWriteTransaction::Ptr tx = std::make_unique<LMDBWriteTransaction>(environment);
            auto key = get_key(count);
            auto data = get_value(count, 0);
            EXPECT_NO_THROW(tx->put_value(key, data, *db));
            EXPECT_NO_THROW(tx->commit());
        }
    }

    {
        for (int64_t count = 0; count < numValues; count++) {
            environment->wait_for_reader();
            LMDBReadTransaction::Ptr tx = std::make_unique<LMDBReadTransaction>(environment);
            auto key = get_key(count);
            auto expected = get_value(count, 0);
            std::vector<uint8_t> data;
            tx->get_value(key, data, *db);
            EXPECT_EQ(data, expected);
        }
    }
}

TEST_F(LMDBEnvironmentTest, can_read_multiple_threads)
{
    LMDBEnvironment::SharedPtr environment =
        std::make_shared<LMDBEnvironment>(LMDBEnvironmentTest::_directory, LMDBEnvironmentTest::_mapSize, 1, 2);

    LMDBDatabase::SharedPtr db;
    {
        environment->wait_for_writer();
        LMDBDatabaseCreationTransaction tx(environment);
        db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
        EXPECT_NO_THROW(tx.commit());
    }

    int64_t numValues = 10;
    int64_t numIterationsPerThread = 1000;
    uint32_t numThreads = 16;

    {
        for (int64_t count = 0; count < numValues; count++) {
            environment->wait_for_writer();
            LMDBWriteTransaction::Ptr tx = std::make_unique<LMDBWriteTransaction>(environment);
            auto key = get_key(count);
            auto expected = get_value(count, 0);
            EXPECT_NO_THROW(tx->put_value(key, expected, *db));
            EXPECT_NO_THROW(tx->commit());
        }
    }

    {
        auto func = [&]() -> void {
            for (int64_t iteration = 0; iteration < numIterationsPerThread; iteration++) {
                for (int64_t count = 0; count < numValues; count++) {
                    environment->wait_for_reader();
                    LMDBReadTransaction::Ptr tx = std::make_unique<LMDBReadTransaction>(environment);
                    auto key = get_key(count);
                    auto expected = get_value(count, 0);
                    std::vector<uint8_t> data;
                    tx->get_value(key, data, *db);
                    EXPECT_EQ(data, expected);
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
