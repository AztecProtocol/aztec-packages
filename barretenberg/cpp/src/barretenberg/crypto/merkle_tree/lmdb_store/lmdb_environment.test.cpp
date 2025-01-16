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
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_database.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_db_transaction.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/queries.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/polynomials/serialize.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "lmdb_tree_store.hpp"

using namespace bb::stdlib;
using namespace bb::crypto::merkle_tree;

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

std::vector<uint8_t> serialise(std::string key)
{
    std::vector<uint8_t> data(key.begin(), key.end());
    return data;
}

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
        LMDBDatabaseCreationTransaction tx(environment);
        LMDBDatabase::SharedPtr db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
        EXPECT_NO_THROW(tx.commit());
    }
}

TEST_F(LMDBEnvironmentTest, can_write_to_database)
{
    LMDBEnvironment::SharedPtr environment = std::make_shared<LMDBEnvironment>(
        LMDBEnvironmentTest::_directory, LMDBEnvironmentTest::_mapSize, 1, LMDBEnvironmentTest::_maxReaders);

    LMDBDatabaseCreationTransaction tx(environment);
    LMDBDatabase::SharedPtr db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
    EXPECT_NO_THROW(tx.commit());

    {
        LMDBTreeWriteTransaction::SharedPtr tx = std::make_shared<LMDBTreeWriteTransaction>(environment);
        auto key = serialise(std::string("Key"));
        auto data = serialise(std::string("TestData"));
        EXPECT_NO_THROW(tx->put_value(key, data, *db));
        EXPECT_NO_THROW(tx->commit());
    }
}

TEST_F(LMDBEnvironmentTest, can_read_from_database)
{
    LMDBEnvironment::SharedPtr environment = std::make_shared<LMDBEnvironment>(
        LMDBEnvironmentTest::_directory, LMDBEnvironmentTest::_mapSize, 1, LMDBEnvironmentTest::_maxReaders);

    LMDBDatabaseCreationTransaction tx(environment);
    LMDBDatabase::SharedPtr db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
    EXPECT_NO_THROW(tx.commit());

    {
        LMDBTreeWriteTransaction::SharedPtr tx = std::make_shared<LMDBTreeWriteTransaction>(environment);
        auto key = serialise(std::string("Key"));
        auto data = serialise(std::string("TestData"));
        EXPECT_NO_THROW(tx->put_value(key, data, *db));
        EXPECT_NO_THROW(tx->commit());
    }

    {
        environment->wait_for_reader();
        LMDBTreeReadTransaction::SharedPtr tx = std::make_shared<LMDBTreeReadTransaction>(environment);
        auto key = serialise(std::string("Key"));
        auto expected = serialise(std::string("TestData"));
        std::vector<uint8_t> data;
        tx->get_value(key, data, *db);
        EXPECT_EQ(data, expected);
    }
}

TEST_F(LMDBEnvironmentTest, can_write_and_read_multiple)
{
    LMDBEnvironment::SharedPtr environment = std::make_shared<LMDBEnvironment>(
        LMDBEnvironmentTest::_directory, LMDBEnvironmentTest::_mapSize, 1, LMDBEnvironmentTest::_maxReaders);

    LMDBDatabaseCreationTransaction tx(environment);
    LMDBDatabase::SharedPtr db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
    EXPECT_NO_THROW(tx.commit());

    uint64_t numValues = 10;

    {
        for (uint64_t count = 0; count < numValues; count++) {
            LMDBTreeWriteTransaction::SharedPtr tx = std::make_shared<LMDBTreeWriteTransaction>(environment);
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            EXPECT_NO_THROW(tx->put_value(key, data, *db));
            EXPECT_NO_THROW(tx->commit());
        }
    }

    {
        for (uint64_t count = 0; count < numValues; count++) {
            environment->wait_for_reader();
            LMDBTreeReadTransaction::SharedPtr tx = std::make_shared<LMDBTreeReadTransaction>(environment);
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto expected = serialise((std::stringstream() << "TestData" << count).str());
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

    LMDBDatabaseCreationTransaction tx(environment);
    LMDBDatabase::SharedPtr db = std::make_unique<LMDBDatabase>(environment, tx, "DB", false, false);
    EXPECT_NO_THROW(tx.commit());

    uint64_t numValues = 10;
    uint64_t numIterationsPerThread = 1000;
    uint32_t numThreads = 16;

    {
        for (uint64_t count = 0; count < numValues; count++) {
            LMDBTreeWriteTransaction::SharedPtr tx = std::make_shared<LMDBTreeWriteTransaction>(environment);
            auto key = serialise((std::stringstream() << "Key" << count).str());
            auto data = serialise((std::stringstream() << "TestData" << count).str());
            EXPECT_NO_THROW(tx->put_value(key, data, *db));
            EXPECT_NO_THROW(tx->commit());
        }
    }

    {
        auto func = [&]() -> void {
            for (uint64_t iteration = 0; iteration < numIterationsPerThread; iteration++) {
                for (uint64_t count = 0; count < numValues; count++) {
                    environment->wait_for_reader();
                    LMDBTreeReadTransaction::SharedPtr tx = std::make_shared<LMDBTreeReadTransaction>(environment);
                    auto key = serialise((std::stringstream() << "Key" << count).str());
                    auto expected = serialise((std::stringstream() << "TestData" << count).str());
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
