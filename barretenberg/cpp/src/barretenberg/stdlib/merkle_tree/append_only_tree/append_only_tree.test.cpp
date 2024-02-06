#include "append_only_tree.hpp"
#include "../array_store.hpp"
#include "../hasher.hpp"
#include "../memory_tree.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"

using namespace bb;
using namespace bb::stdlib::merkle_tree;

namespace {
auto& engine = numeric::get_debug_randomness();
auto& random_engine = numeric::get_randomness();
} // namespace

const size_t NUM_VALUES = 1024;
static std::vector<fr> VALUES = []() {
    std::vector<fr> values(NUM_VALUES);
    for (size_t i = 0; i < NUM_VALUES; ++i) {
        values[i] = fr(random_engine.get_random_uint256());
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

TEST(stdlib_append_only_tree, can_create)
{
    constexpr size_t depth = 10;
    Poseidon2Hasher hasher = Poseidon2Hasher();
    ArrayStore store(depth + 1, 1024);
    AppendOnlyTree tree(hasher, store, depth);
    MemoryTree memdb(depth);

    EXPECT_EQ(tree.size(), 0);
    EXPECT_EQ(tree.root(), memdb.root());
}

TEST(stdlib_append_only_tree, can_add_value)
{
    constexpr size_t depth = 10;
    Poseidon2Hasher hasher = Poseidon2Hasher();
    ArrayStore store(depth + 1, 1024);
    AppendOnlyTree tree(hasher, store, depth);
    MemoryTree memdb(depth);

    EXPECT_EQ(tree.size(), 0);
    EXPECT_EQ(tree.root(), memdb.root());

    memdb.update_element(0, VALUES[0]);
    tree.add_value(VALUES[0]);

    EXPECT_EQ(tree.root(), memdb.root());
    EXPECT_EQ(tree.get_hash_path(0), memdb.get_hash_path(0));
}

TEST(stdlib_append_only_tree, test_size)
{
    constexpr size_t depth = 10;
    Poseidon2Hasher hasher = Poseidon2Hasher();
    ArrayStore store(depth + 1, 1024);
    AppendOnlyTree tree(hasher, store, depth);

    EXPECT_EQ(tree.size(), 0ULL);

    // Add a new non-zero leaf at index 0.
    tree.add_value(30);
    EXPECT_EQ(tree.size(), 1ULL);

    // Add second.
    tree.add_value(10);
    EXPECT_EQ(tree.size(), 2ULL);

    // Add third.
    tree.add_value(20);
    EXPECT_EQ(tree.size(), 3ULL);

    // Add forth but with same value.
    tree.add_value(20);
    EXPECT_EQ(tree.size(), 4ULL);
}

TEST(stdlib_append_only_tree, can_add_multiple_values)
{
    constexpr size_t depth = 10;
    Poseidon2Hasher hasher = Poseidon2Hasher();
    ArrayStore store(depth + 1, 1024);
    AppendOnlyTree tree(hasher, store, depth);
    MemoryTree memdb(depth);

    for (size_t i = 0; i < NUM_VALUES; ++i) {
        fr mock_root = memdb.update_element(i, VALUES[i]);
        fr tree_root = tree.add_value(VALUES[i]);
        EXPECT_EQ(mock_root, tree_root);

        EXPECT_EQ(memdb.get_hash_path(0), tree.get_hash_path(0));
        EXPECT_EQ(memdb.get_hash_path(i), tree.get_hash_path(i));
    }
}
