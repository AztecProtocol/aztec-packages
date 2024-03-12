#include <gtest/gtest.h>

#include <chrono>
#include <cstdlib>
#include <filesystem>

#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "lmdb_store.hpp"

using namespace bb::stdlib;
using namespace bb::db_cli;

using Builder = bb::UltraCircuitBuilder;

using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;
namespace {
auto& engine = bb::numeric::get_debug_randomness();
auto& random_engine = bb::numeric::get_randomness();
} // namespace

const int SAMPLE_DATA_SIZE = 1024;

static std::vector<bb::fr> VALUES = []() {
    std::vector<bb::fr> values(SAMPLE_DATA_SIZE);
    for (size_t i = 0; i < SAMPLE_DATA_SIZE; ++i) {
        values[i] = bb::fr::random_element(&engine);
    }
    return values;
}();

class LMDBStoreTest : public testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        const int random_directory_value = rand();
        std::stringstream ss;
        ss << "/tmp/lmdb" << random_directory_value;
        _directory = ss.str();
        std::filesystem::create_directories(_directory);
    }

    static void TearDownTestSuite() { std::filesystem::remove_all(_directory); }

    void SetUp()
    {
        // setup with 1MB max db size, 1 max database and 2 maximum concurrent readers
        _environment.reset(new LMDBEnvironment(_directory, 1, 1, 2));
    }

    static std::string _directory;

    std::unique_ptr<LMDBEnvironment> _environment;
};

std::string LMDBStoreTest::_directory = "";

TEST_F(LMDBStoreTest, can_write_to_and_read_from_store)
{
    LMDBStore store(*_environment, "note hash tree");

    {
        std::vector<uint8_t> buf;
        write(buf, VALUES[0]);
        LMDBWriteTransaction::Ptr transaction = store.createWriteTransaction();
        transaction->put(0, 0, buf);
    }

    {
        LMDBReadTransaction::Ptr transaction = store.createReadTransaction();
        std::vector<uint8_t> buf2;
        bool success = transaction->get(0, 0, buf2);
        EXPECT_EQ(success, true);
        bb::fr value = from_buffer<bb::fr>(buf2, 0);
        EXPECT_EQ(value, VALUES[0]);
    }
}

TEST_F(LMDBStoreTest, reading_an_empty_key_reports_correctly)
{
    LMDBStore store(*_environment, "note hash tree");

    {
        std::vector<uint8_t> buf;
        write(buf, VALUES[0]);
        LMDBWriteTransaction::Ptr transaction = store.createWriteTransaction();
        transaction->put(0, 0, buf);
    }

    {
        LMDBReadTransaction::Ptr transaction = store.createReadTransaction();
        std::vector<uint8_t> buf2;
        bool success = transaction->get(0, 1, buf2);
        EXPECT_EQ(success, false);
    }
}

TEST_F(LMDBStoreTest, can_write_and_read_multiple)
{
    LMDBStore store(*_environment, "note hash tree");

    {
        LMDBWriteTransaction::Ptr transaction = store.createWriteTransaction();
        for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
            std::vector<uint8_t> buf;
            write(buf, VALUES[i]);
            transaction->put(10, i, buf);
        }
    }

    {
        LMDBReadTransaction::Ptr transaction = store.createReadTransaction();
        for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
            std::vector<uint8_t> buf2;
            bool success = transaction->get(10, i, buf2);
            EXPECT_EQ(success, true);
            bb::fr value = from_buffer<bb::fr>(buf2, 0);
            EXPECT_EQ(value, VALUES[i]);
        }
    }
}

TEST_F(LMDBStoreTest, can_write_batch_and_read_back)
{
    LMDBStore store(*_environment, "note hash tree");

    std::vector<uint8_t> buf;
    for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
        std::vector<uint8_t> temp;
        write(temp, VALUES[i]);
        int old_size = int(buf.size());
        buf.resize(buf.size() + temp.size());
        copy(temp.begin(), temp.end(), buf.begin() + old_size);
    }

    {
        LMDBWriteTransaction::Ptr transaction = store.createWriteTransaction();
        transaction->put(10, 0, buf, 32);
    }

    for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
        std::vector<uint8_t> buf2;
        bool success = store.createReadTransaction()->get(10, i, buf2);
        EXPECT_EQ(success, true);
        bb::fr value = from_buffer<bb::fr>(buf2, 0);
        EXPECT_EQ(value, VALUES[i]);
    }
}

TEST_F(LMDBStoreTest, can_write_and_read_at_random_keys)
{
    LMDBStore store(*_environment, "note hash tree");

    std::vector<size_t> keys;

    {
        LMDBWriteTransaction::Ptr transaction = store.createWriteTransaction();

        for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
            std::vector<uint8_t> buf;
            write(buf, VALUES[i]);
            size_t key = size_t(rand() % 10000000);
            keys.push_back(key);
            transaction->put(0, key, buf);
        }
    }

    {
        LMDBReadTransaction::Ptr transaction = store.createReadTransaction();
        for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
            std::vector<uint8_t> buf2;
            bool success = transaction->get(0, keys[i], buf2);
            EXPECT_EQ(success, true);
            bb::fr value = from_buffer<bb::fr>(buf2, 0);
            EXPECT_EQ(value, VALUES[i]);
        }
    }
}

TEST_F(LMDBStoreTest, can_recreate_the_store_and_use_again)
{
    std::vector<size_t> keys;
    {
        LMDBStore store(*_environment, "note hash tree");

        LMDBWriteTransaction::Ptr transaction = store.createWriteTransaction();

        for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
            std::vector<uint8_t> buf;
            write(buf, VALUES[i]);
            size_t key = size_t(rand() % 10000000);
            keys.push_back(key);
            transaction->put(0, key, buf);
        }
    }

    {
        LMDBStore store(*_environment, "note hash tree");

        LMDBReadTransaction::Ptr transaction = store.createReadTransaction();
        for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
            std::vector<uint8_t> buf2;
            bool success = transaction->get(0, keys[i], buf2);
            EXPECT_EQ(success, true);
            bb::fr value = from_buffer<bb::fr>(buf2, 0);
            EXPECT_EQ(value, VALUES[i]);
        }
    }
}

void read_loop(LMDBStore& store, size_t key, std::atomic<size_t>& flag, bb::fr starting_value)
{
    bool seen = false;
    while (true) {
        LMDBReadTransaction::Ptr transaction = store.createReadTransaction();
        std::vector<uint8_t> buf;
        bool success = transaction->get(0, key, buf);
        EXPECT_EQ(success, true);
        bb::fr value = from_buffer<bb::fr>(buf, 0);
        if (value == starting_value && !seen) {
            // acknowledge that we have seen the old value
            flag--;
            seen = true;
        }
        if (value == starting_value + bb::fr(1)) {
            // exit now that we have seen the new value
            break;
        }
    }
}

TEST_F(LMDBStoreTest, can_read_from_multiple_threads)
{
    std::cout << "Multiple Threads" << std::endl;
    LMDBStore store(*_environment, "note hash tree");
    const int num_threads = 5;

    size_t key = size_t(rand() % 1000000);

    {
        // we write VALUES[0] to a slot
        LMDBWriteTransaction::Ptr transaction = store.createWriteTransaction();
        std::vector<uint8_t> buf;
        write(buf, VALUES[0]);
        transaction->put(0, key, buf);
    }

    {
        // we setup multiple threads to read the slot and check they shutdown when the value changes
        std::vector<std::thread> threads;
        std::atomic<size_t> flag = num_threads;
        for (size_t i = 0; i < num_threads; i++) {
            threads.push_back(std::thread(read_loop, std::ref(store), key, std::ref(flag), VALUES[0]));
        }
        // wait until all threads have seen the old value
        while (flag != 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
        {
            // we write VALUES[0] + 1 to the slot
            LMDBWriteTransaction::Ptr transaction = store.createWriteTransaction();
            std::vector<uint8_t> buf;
            write(buf, VALUES[0] + 1);
            transaction->put(0, key, buf);
        }
        // now wait for all threads to exit having seen the new value
        for (size_t i = 0; i < 5; i++) {
            threads[i].join();
        }
    }
}