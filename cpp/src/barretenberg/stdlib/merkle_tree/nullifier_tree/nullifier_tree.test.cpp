#include "../memory_store.hpp"
#include "nullifier_memory_tree.hpp"
#include "nullifier_tree.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"

using namespace barretenberg;
using namespace proof_system::plonk::stdlib::merkle_tree;

namespace {
auto& engine = numeric::random::get_debug_engine();
auto& random_engine = numeric::random::get_engine();
} // namespace

static std::vector<fr> VALUES = []() {
    std::vector<fr> values(1024);
    for (size_t i = 0; i < 1024; ++i) {
        values[i] = fr(random_engine.get_random_uint64());
    }
    return values;
}();

inline void print_tree(const size_t depth, std::vector<fr> hashes, std::string const& msg)
{
    info("\n", msg);
    size_t offset = 0;
    for (size_t i = 0; i < depth; i++) {
        info("i = ", i);
        size_t layer_size = (1UL << (depth - i));
        for (size_t j = 0; j < layer_size; j++) {
            info("j = ", j, ": ", hashes[offset + j]);
        }
        offset += layer_size;
    }
}

TEST(stdlib_nullifier_tree, test_kv_memory_vs_memory_consistency)
{
    constexpr size_t depth = 2;
    NullifierMemoryTree memdb(depth);

    MemoryStore store;
    NullifierTree db(store, depth);

    std::vector<size_t> indicies(1 << depth);
    std::iota(indicies.begin(), indicies.end(), 0);
    std::random_device rd;
    std::mt19937 g(rd());
    std::shuffle(indicies.begin(), indicies.end(), g);

    for (size_t i = 0; i < indicies.size() - 1; ++i) {
        size_t idx = indicies[i];
        memdb.update_element(VALUES[idx]);
        db.update_element(VALUES[idx]);
    }

    for (size_t i = 0; i < indicies.size() - 1; ++i) {
        size_t idx = indicies[i];
        EXPECT_EQ(db.get_hash_path(idx), memdb.get_hash_path(idx));
    }

    EXPECT_EQ(db.root(), memdb.root());
}

TEST(stdlib_nullifier_tree, test_size)
{
    MemoryStore store;
    auto db = NullifierTree(store, 256);

    // We assume that the first leaf is already filled with (0, 0, 0).
    EXPECT_EQ(db.size(), 1ULL);

    // Add a new non-zero leaf at index 1.
    db.update_element(30);
    EXPECT_EQ(db.size(), 2ULL);

    // Add third.
    db.update_element(10);
    EXPECT_EQ(db.size(), 3ULL);

    // Add forth.
    db.update_element(20);
    EXPECT_EQ(db.size(), 4ULL);

    // Add forth but with same value.
    db.update_element(20);
    EXPECT_EQ(db.size(), 4ULL);
}

TEST(stdlib_nullifier_tree, test_get_hash_path)
{
    NullifierMemoryTree memdb(10);

    MemoryStore store;
    auto db = NullifierTree(store, 10);

    EXPECT_EQ(memdb.get_hash_path(512), db.get_hash_path(512));

    memdb.update_element(VALUES[512]);
    db.update_element(VALUES[512]);

    EXPECT_EQ(db.get_hash_path(512), memdb.get_hash_path(512));

    for (size_t i = 0; i < 512; ++i) {
        memdb.update_element(VALUES[i]);
        db.update_element(VALUES[i]);
    }

    EXPECT_EQ(db.get_hash_path(512), memdb.get_hash_path(512));
}

TEST(stdlib_nullifier_tree, test_get_hash_path_layers)
{
    {
        MemoryStore store;
        auto db = NullifierTree(store, 3);

        auto before = db.get_hash_path(1);
        db.update_element(VALUES[1]);
        auto after = db.get_hash_path(1);

        EXPECT_NE(before[0], after[0]);
        EXPECT_NE(before[1], after[1]);
        EXPECT_NE(before[2], after[2]);
    }

    {
        MemoryStore store;
        auto db = NullifierTree(store, 3);

        auto before = db.get_hash_path(7);
        db.update_element(VALUES[1]);
        auto after = db.get_hash_path(7);

        EXPECT_EQ(before[0], after[0]);
        EXPECT_EQ(before[1], after[1]);
        EXPECT_NE(before[2], after[2]);
    }
}