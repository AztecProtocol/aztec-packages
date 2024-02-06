#include "indexed_tree.hpp"
#include "../hasher.hpp"
#include "../nullifier_tree/nullifier_memory_tree.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "fixed_memory_store.hpp"
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
    FixedMemoryStore store(33, 20);
    Poseidon2Hasher hasher;
    // MemoryStore store;
    IndexedTree<FixedMemoryStore, LeavesCache> tree = IndexedTree<FixedMemoryStore, LeavesCache>(hasher, store, 32);
    EXPECT_EQ(tree.get_size(), 1ULL);
}

TEST(stdlib_indexed_tree, test_size)
{
    Poseidon2Hasher hasher;
    FixedMemoryStore store(33, 20);
    auto db = IndexedTree<FixedMemoryStore, LeavesCache>(hasher, store, 32);

    // We assume that the first leaf is already filled with (0, 0, 0).
    EXPECT_EQ(db.get_size(), 1ULL);

    // Add a new non-zero leaf at index 1.
    db.update_element(30);
    EXPECT_EQ(db.get_size(), 2ULL);

    // Add third.
    db.update_element(10);
    EXPECT_EQ(db.get_size(), 3ULL);

    // Add forth.
    db.update_element(20);
    EXPECT_EQ(db.get_size(), 4ULL);

    // Add forth but with same value.
    db.update_element(20);
    EXPECT_EQ(db.get_size(), 4ULL);
}

TEST(stdlib_indexed_tree, test_get_hash_path)
{
    NullifierMemoryTree memdb(10);

    Poseidon2Hasher hasher;
    FixedMemoryStore store(11, 1024);
    auto db = IndexedTree<FixedMemoryStore, LeavesCache>(hasher, store, 10);

    EXPECT_EQ(memdb.root(), db.get_root());

    EXPECT_EQ(memdb.get_hash_path(0), db.get_hash_path(0));

    memdb.update_element(VALUES[512]);
    db.update_element(VALUES[512]);

    EXPECT_EQ(db.get_hash_path(0), memdb.get_hash_path(0));

    for (size_t i = 0; i < 512; ++i) {
        memdb.update_element(VALUES[i]);
        db.update_element(VALUES[i]);
    }

    EXPECT_EQ(db.get_hash_path(512), memdb.get_hash_path(512));
}

TEST(stdlib_indexed_tree, test_batch_insert)
{
    const size_t batch_size = 16;
    const size_t num_batches = 16;
    size_t depth = 10;
    NullifierMemoryTree memdb(depth, batch_size);

    Poseidon2Hasher hasher1;
    FixedMemoryStore store1(depth + 1, 1024 * 1024);
    IndexedTree<FixedMemoryStore, LeavesCache> tree1 =
        IndexedTree<FixedMemoryStore, LeavesCache>(hasher1, store1, depth, batch_size);
    Poseidon2Hasher hasher2;
    FixedMemoryStore store2(depth + 1, 1024 * 1024);
    IndexedTree<FixedMemoryStore, LeavesCache> tree2 =
        IndexedTree<FixedMemoryStore, LeavesCache>(hasher2, store2, depth, batch_size);

    EXPECT_EQ(memdb.root(), tree1.get_root());
    EXPECT_EQ(tree1.get_root(), tree2.get_root());

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
        std::vector<fr_hash_path> tree1_hash_paths = tree1.update_elements(batch, true);
        std::vector<fr_hash_path> tree2_hash_paths = tree2.update_elements(batch);
        EXPECT_EQ(memdb.root(), tree1.get_root());
        EXPECT_EQ(tree1.get_root(), tree2.get_root());

        EXPECT_EQ(memdb.get_hash_path(0), tree1.get_hash_path(0));
        EXPECT_EQ(tree1.get_hash_path(0), tree2.get_hash_path(0));

        EXPECT_EQ(memdb.get_hash_path(512), tree1.get_hash_path(512));
        EXPECT_EQ(tree1.get_hash_path(512), tree2.get_hash_path(512));

        for (size_t j = 0; j < batch_size; j++) {
            EXPECT_EQ(tree1_hash_paths[j], tree2_hash_paths[j]);
        }
    }
}