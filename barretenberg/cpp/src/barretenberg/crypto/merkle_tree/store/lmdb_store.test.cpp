#include <gtest/gtest.h>

#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include "lmdb_store.hpp"

using namespace bb::stdlib;
using namespace bb::crypto::merkle_tree;

using Builder = UltraCircuitBuilder;

using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;
namespace {
auto& engine = numeric::get_debug_randomness();
auto& random_engine = numeric::get_randomness();
} // namespace

static std::vector<fr> VALUES = []() {
    std::vector<fr> values(1024);
    for (size_t i = 0; i < 1024; ++i) {
        values[i] = i;
    }
    return values;
}();

TEST(lmdb_store, test_open)
{

    LMDBStore store("tmp/lmdb");
}