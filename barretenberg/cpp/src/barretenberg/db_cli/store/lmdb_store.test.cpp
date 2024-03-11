#include <gtest/gtest.h>

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

const std::string directory = "/tmp/lmdb";

class LMDBStoreTest : public testing::Test {
  protected:
    static void SetUpTestSuite() { std::filesystem::create_directories(directory); }

    //   static void TearDownTestSuite() {
    //   }
};

TEST(lmdb_store, can_create_store)
{
    LMDBEnvironment environment(directory);
    LMDBStore store(environment, "note hash tree");
    std::vector<uint8_t> buf;
    write(buf, VALUES[0]);

    store.createWriteTransaction();
    store.put(0, 0, buf);
    store.commitWriteTransaction()

        std::vector<uint8_t>
            buf2;
    bool success = store.get(0, 0, buf2);
    EXPECT_EQ(success, true);
    bb::fr value = from_buffer<bb::fr>(buf2, 0);
    EXPECT_EQ(value, VALUES[0]);
}

TEST(lmdb_store, can_write_to_and_read_from_store)
{
    LMDBEnvironment environment(directory);
    LMDBStore store(environment, "note hash tree");
    std::vector<uint8_t> buf;
    write(buf, VALUES[0]);
    store.put(0, 0, buf);

    std::vector<uint8_t> buf2;
    bool success = store.get(0, 0, buf2);
    EXPECT_EQ(success, true);
    bb::fr value = from_buffer<bb::fr>(buf2, 0);
    EXPECT_EQ(value, VALUES[0]);
}

TEST(lmdb_store, can_write_and_read_multiple)
{
    LMDBEnvironment environment(directory);
    LMDBStore store(environment, "note hash tree");

    for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
        std::vector<uint8_t> buf;
        write(buf, VALUES[i]);
        store.put(10, i, buf);
    }

    for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
        std::vector<uint8_t> buf2;
        bool success = store.get(10, i, buf2);
        EXPECT_EQ(success, true);
        bb::fr value = from_buffer<bb::fr>(buf2, 0);
        EXPECT_EQ(value, VALUES[i]);
    }
}

TEST(lmdb_store, can_write_batch_and_read_back)
{
    LMDBEnvironment environment(directory);
    LMDBStore store(environment, "note hash tree");

    std::vector<uint8_t> buf;
    for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
        std::vector<uint8_t> temp;
        write(temp, VALUES[i]);
        int old_size = int(buf.size());
        buf.resize(buf.size() + temp.size());
        copy(temp.begin(), temp.end(), buf.begin() + old_size);
    }
    store.put(10, 0, buf, 32);

    for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
        std::vector<uint8_t> buf2;
        bool success = store.get(10, i, buf2);
        EXPECT_EQ(success, true);
        bb::fr value = from_buffer<bb::fr>(buf2, 0);
        EXPECT_EQ(value, VALUES[i]);
    }
}

TEST(lmdb_store, can_write_and_read_at_random_keys)
{
    LMDBEnvironment environment(directory);
    LMDBStore store(environment, "note hash tree");

    std::vector<size_t> keys;

    for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
        std::vector<uint8_t> buf;
        write(buf, VALUES[i]);
        size_t key = size_t(rand() % 10000000);
        keys.push_back(key);
        store.put(0, key, buf);
    }

    for (size_t i = 0; i < SAMPLE_DATA_SIZE; i++) {
        std::vector<uint8_t> buf2;
        bool success = store.get(0, keys[i], buf2);
        EXPECT_EQ(success, true);
        bb::fr value = from_buffer<bb::fr>(buf2, 0);
        EXPECT_EQ(value, VALUES[i]);
    }
}