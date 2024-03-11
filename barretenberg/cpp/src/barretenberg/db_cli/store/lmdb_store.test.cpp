#include <gtest/gtest.h>

#include <filesystem>

#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "lmdb_store.hpp"

using namespace bb::stdlib;
using namespace bb::crypto::merkle_tree;

using Builder = bb::UltraCircuitBuilder;

using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;
namespace {
auto& engine = bb::numeric::get_debug_randomness();
auto& random_engine = bb::numeric::get_randomness();
} // namespace

static std::vector<bb::fr> VALUES = []() {
    std::vector<bb::fr> values(1024);
    for (size_t i = 0; i < 1024; ++i) {
        values[i] = i;
    }
    return values;
}();

TEST(lmdb_store, test_open)
{
    std::filesystem::create_directories("/tmp/lmdb");
    std::cout << "Hello!" << std::endl;
    LMDBEnvironment environment("/tmp/lmdb");
    LMDBStore store(environment, "note hash tree");
    std::cout << "HERE" << std::endl;
    std::vector<uint8_t> buf;
    write(buf, VALUES[0]);
    store.put(0, 0, buf);

    std::vector<uint8_t> buf2;
    bool success = store.get(0, 0, buf2);
    EXPECT_EQ(success, true);
    bb::fr value = from_buffer<bb::fr>(buf2, 0);
    EXPECT_EQ(value, VALUES[0]);
}