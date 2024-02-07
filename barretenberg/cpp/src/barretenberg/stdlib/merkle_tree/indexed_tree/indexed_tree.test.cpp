#include "indexed_tree.hpp"
#include "../array_store.hpp"
#include "../hash.hpp"
#include "../nullifier_tree/nullifier_memory_tree.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "leaves_cache.hpp"

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

TEST(stdlib_indexed_tree, can_create)
{
    ArrayStore store(33, 20);
    IndexedTree<ArrayStore, LeavesCache, Poseidon2HashPolicy> tree =
        IndexedTree<ArrayStore, LeavesCache, Poseidon2HashPolicy>(store, 32);
    EXPECT_EQ(tree.size(), 1ULL);
}

TEST(stdlib_indexed_tree, test_size)
{
    ArrayStore store(33, 20);
    auto db = IndexedTree<ArrayStore, LeavesCache, Poseidon2HashPolicy>(store, 32);

    // We assume that the first leaf is already filled with (0, 0, 0).
    EXPECT_EQ(db.size(), 1ULL);

    // Add a new non-zero leaf at index 1.
    db.add_value(30);
    EXPECT_EQ(db.size(), 2ULL);

    // Add third.
    db.add_value(10);
    EXPECT_EQ(db.size(), 3ULL);

    // Add forth.
    db.add_value(20);
    EXPECT_EQ(db.size(), 4ULL);
}

TEST(stdlib_indexed_tree, test_get_hash_path)
{
    NullifierMemoryTree<Poseidon2HashPolicy> memdb(10);

    ArrayStore store(11, 1024);
    auto db = IndexedTree<ArrayStore, LeavesCache, Poseidon2HashPolicy>(store, 10);

    EXPECT_EQ(memdb.root(), db.root());

    EXPECT_EQ(memdb.get_hash_path(0), db.get_hash_path(0));

    memdb.update_element(VALUES[512]);
    db.add_value(VALUES[512]);

    EXPECT_EQ(db.get_hash_path(0), memdb.get_hash_path(0));

    for (size_t i = 0; i < 512; ++i) {
        memdb.update_element(VALUES[i]);
        db.add_value(VALUES[i]);
    }

    EXPECT_EQ(db.get_hash_path(512), memdb.get_hash_path(512));
}

TEST(stdlib_indexed_tree, test_batch_insert)
{
    const size_t batch_size = 16;
    const size_t num_batches = 16;
    size_t depth = 10;
    NullifierMemoryTree<Poseidon2HashPolicy> memdb(depth, batch_size);

    ArrayStore store1(depth + 1, 1024 * 1024);
    IndexedTree<ArrayStore, LeavesCache, Poseidon2HashPolicy> tree1 =
        IndexedTree<ArrayStore, LeavesCache, Poseidon2HashPolicy>(store1, depth, batch_size);

    ArrayStore store2(depth + 1, 1024 * 1024);
    IndexedTree<ArrayStore, LeavesCache, Poseidon2HashPolicy> tree2 =
        IndexedTree<ArrayStore, LeavesCache, Poseidon2HashPolicy>(store2, depth, batch_size);

    EXPECT_EQ(memdb.root(), tree1.root());
    EXPECT_EQ(tree1.root(), tree2.root());

    EXPECT_EQ(memdb.get_hash_path(0), tree1.get_hash_path(0));
    EXPECT_EQ(tree1.get_hash_path(0), tree2.get_hash_path(0));

    EXPECT_EQ(memdb.get_hash_path(512), tree1.get_hash_path(512));
    EXPECT_EQ(tree1.get_hash_path(512), tree2.get_hash_path(512));

    for (size_t i = 0; i < num_batches; i++) {
        std::vector<fr> batch;
        for (size_t j = 0; j < batch_size; j++) {
            batch.push_back(fr(random_engine.get_random_uint256()));
            memdb.update_element(batch[j]);
        }
        std::vector<fr_hash_path> tree1_hash_paths = tree1.add_or_update_values(batch, true);
        std::vector<fr_hash_path> tree2_hash_paths = tree2.add_or_update_values(batch);
        EXPECT_EQ(memdb.root(), tree1.root());
        EXPECT_EQ(tree1.root(), tree2.root());

        EXPECT_EQ(memdb.get_hash_path(0), tree1.get_hash_path(0));
        EXPECT_EQ(tree1.get_hash_path(0), tree2.get_hash_path(0));

        EXPECT_EQ(memdb.get_hash_path(512), tree1.get_hash_path(512));
        EXPECT_EQ(tree1.get_hash_path(512), tree2.get_hash_path(512));

        for (size_t j = 0; j < batch_size; j++) {
            EXPECT_EQ(tree1_hash_paths[j], tree2_hash_paths[j]);
        }
    }
}