#include "append_only_tree.hpp"
#include "../array_store.hpp"
#include "../memory_tree.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/numeric/random/engine.hpp"

using namespace bb;
using namespace bb::crypto::merkle_tree;

namespace {
auto& engine = numeric::get_debug_randomness();
auto& random_engine = numeric::get_randomness();
} // namespace

const uint32_t NUM_VALUES = 1024;
static std::vector<fr> VALUES = []() {
    std::vector<fr> values(NUM_VALUES);
    for (uint32_t i = 0; i < NUM_VALUES; ++i) {
        values[i] = fr(random_engine.get_random_uint256());
    }
    return values;
}();

inline void print_tree(const uint32_t depth, std::vector<fr> hashes, std::string const& msg)
{
    info("\n", msg);
    uint32_t offset = 0;
    for (uint32_t i = 0; i < depth; i++) {
        info("i = ", i);
        uint32_t layer_size = (1U << (depth - i));
        for (uint32_t j = 0; j < layer_size; j++) {
            info("j = ", j, ": ", hashes[offset + j]);
        }
        offset += layer_size;
    }
}

TEST(crypto_append_only_tree, can_create)
{
    constexpr size_t depth = 10;
    ArrayStore store(depth);
    ThreadPool pool(1);
    AppendOnlyTree<ArrayStore, Poseidon2HashPolicy> tree(store, depth, pool, "Test Tree");
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    EXPECT_EQ(tree.size(), 0);
    EXPECT_EQ(tree.root(), memdb.root());
}

TEST(crypto_append_only_tree, can_add_value)
{
    constexpr size_t depth = 10;
    ArrayStore store(depth);
    ThreadPool pool(1);
    AppendOnlyTree<ArrayStore, Poseidon2HashPolicy> tree(store, depth, pool, "Test Tree");
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    EXPECT_EQ(tree.size(), 0);
    EXPECT_EQ(tree.root(), memdb.root());

    LevelSignal signal(1);
    auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };

    memdb.update_element(0, VALUES[0]);
    tree.add_value(VALUES[0], completion);
    signal.wait_for_level(0);

    EXPECT_EQ(tree.root(), memdb.root());
    EXPECT_EQ(tree.get_hash_path(0), memdb.get_hash_path(0));
}

TEST(crypto_append_only_tree, test_size)
{
    constexpr size_t depth = 10;
    ArrayStore store(depth);
    ThreadPool pool(1);
    AppendOnlyTree<ArrayStore, Poseidon2HashPolicy> tree(store, depth, pool, "Test Tree");

    EXPECT_EQ(tree.size(), 0ULL);

    // Add a new non-zero leaf at index 0.
    {
        LevelSignal signal(1);
        auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };
        tree.add_value(30, completion);
        signal.wait_for_level(0);
        EXPECT_EQ(tree.size(), 1ULL);
    }

    // Add second.
    {
        LevelSignal signal(1);
        auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };
        tree.add_value(10, completion);
        signal.wait_for_level(0);
        EXPECT_EQ(tree.size(), 2ULL);
    }

    // Add third.
    {
        LevelSignal signal(1);
        auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };
        tree.add_value(20, completion);
        signal.wait_for_level(0);
        EXPECT_EQ(tree.size(), 3ULL);
    }

    // Add forth but with same value.
    {
        LevelSignal signal(1);
        auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };
        tree.add_value(20, completion);
        signal.wait_for_level(0);
        EXPECT_EQ(tree.size(), 4ULL);
    }
}

TEST(crypto_append_only_tree, can_add_multiple_values)
{
    constexpr size_t depth = 10;
    ArrayStore store(depth);
    ThreadPool pool(1);
    AppendOnlyTree<ArrayStore, Poseidon2HashPolicy> tree(store, depth, pool, "Test Tree");
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    for (size_t i = 0; i < NUM_VALUES; ++i) {
        fr mock_root = memdb.update_element(i, VALUES[i]);
        LevelSignal signal(1);
        auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };
        tree.add_value(VALUES[i], completion);
        signal.wait_for_level(0);
        fr tree_root = tree.root();
        EXPECT_EQ(mock_root, tree_root);

        EXPECT_EQ(memdb.get_hash_path(0), tree.get_hash_path(0));
        EXPECT_EQ(memdb.get_hash_path(i), tree.get_hash_path(i));
    }
}

TEST(crypto_append_only_tree, can_be_filled)
{
    constexpr size_t depth = 3;
    ArrayStore store(depth);
    ThreadPool pool(1);
    AppendOnlyTree<ArrayStore, Poseidon2HashPolicy> tree(store, depth, pool, "Test Tree");
    MemoryTree<Poseidon2HashPolicy> memdb(depth);

    EXPECT_EQ(tree.size(), 0);
    EXPECT_EQ(tree.root(), memdb.root());

    for (size_t i = 0; i < 8; i++) {
        memdb.update_element(i, VALUES[i]);
        LevelSignal signal(1);
        auto completion = [&](fr, index_t) -> void { signal.signal_level(0); };
        tree.add_value(VALUES[i], completion);
        signal.wait_for_level(0);
    }

    EXPECT_EQ(tree.root(), memdb.root());
    EXPECT_EQ(tree.get_hash_path(0), memdb.get_hash_path(0));
    EXPECT_EQ(tree.get_hash_path(7), memdb.get_hash_path(7));
}
