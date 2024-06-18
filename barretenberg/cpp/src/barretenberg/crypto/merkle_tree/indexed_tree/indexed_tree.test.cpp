#include "indexed_tree.hpp"
#include "../array_store.hpp"
#include "../hash.hpp"
#include "../nullifier_tree/nullifier_memory_tree.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "leaves_cache.hpp"

using namespace bb;
using namespace bb::crypto::merkle_tree;

using HashPolicy = Poseidon2HashPolicy;

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

using CompletionCallback = IndexedTree<ArrayStore, LeavesCache, HashPolicy>::add_completion_callback;

template <typename Store, typename Cache, typename HashingPolicy>
void add_value(IndexedTree<Store, Cache, HashingPolicy>& tree, fr value)
{
    LevelSignal signal(1);
    CompletionCallback completion = [&](std::vector<fr_hash_path>&, fr&, index_t) { signal.signal_level(0); };
    tree.add_or_update_value(value, completion);
    signal.wait_for_level(0);
}

TEST(crypto_indexed_tree, can_create)
{
    ThreadPool workers(1);
    ArrayStore store(10);
    IndexedTree<ArrayStore, LeavesCache, HashPolicy> tree =
        IndexedTree<ArrayStore, LeavesCache, HashPolicy>(store, 10, workers, 1, "Test Tree");
    EXPECT_EQ(tree.size(), 1ULL);

    NullifierMemoryTree<HashPolicy> memdb(10);
    EXPECT_EQ(memdb.root(), tree.root());
}

TEST(crypto_indexed_tree, test_size)
{
    ThreadPool workers(1);
    ArrayStore store(32);
    auto db = IndexedTree<ArrayStore, LeavesCache, HashPolicy>(store, 32, workers, 1, "Test Tree");

    // We assume that the first leaf is already filled with (0, 0, 0).
    EXPECT_EQ(db.size(), 1ULL);

    // Add a new non-zero leaf at index 1.
    add_value(db, 30);
    EXPECT_EQ(db.size(), 2ULL);

    // Add third.
    add_value(db, 20);
    EXPECT_EQ(db.size(), 3ULL);

    add_value(db, 10);
    EXPECT_EQ(db.size(), 4ULL);
}

TEST(crypto_indexed_tree, test_get_hash_path)
{
    NullifierMemoryTree<HashPolicy> memdb(10);

    ThreadPool workers(1);
    ArrayStore store(10);
    auto db = IndexedTree<ArrayStore, LeavesCache, HashPolicy>(store, 10, workers, 1, "Test Tree");

    EXPECT_EQ(memdb.root(), db.root());

    EXPECT_EQ(memdb.get_hash_path(0), db.get_hash_path(0));

    memdb.update_element(VALUES[512]);
    add_value(db, VALUES[512]);

    EXPECT_EQ(db.get_hash_path(0), memdb.get_hash_path(0));

    for (uint32_t i = 0; i < 512; ++i) {
        memdb.update_element(VALUES[i]);
        add_value(db, VALUES[i]);
    }

    EXPECT_EQ(db.get_hash_path(512), memdb.get_hash_path(512));
}

TEST(crypto_indexed_tree, test_batch_insert)
{
    const uint32_t batch_size = 16;
    const uint32_t num_batches = 16;
    uint32_t depth = 10;
    ThreadPool workers(1);
    ThreadPool multi_workers(8);
    NullifierMemoryTree<HashPolicy> memdb(depth, batch_size);

    ArrayStore store1(depth);
    IndexedTree<ArrayStore, LeavesCache, HashPolicy> tree1 =
        IndexedTree<ArrayStore, LeavesCache, HashPolicy>(store1, depth, workers, batch_size, "Test Tree 1");

    ArrayStore store2(depth);
    IndexedTree<ArrayStore, LeavesCache, HashPolicy> tree2 =
        IndexedTree<ArrayStore, LeavesCache, HashPolicy>(store2, depth, workers, batch_size, "Test Tree 2");

    EXPECT_EQ(memdb.root(), tree1.root());
    EXPECT_EQ(tree1.root(), tree2.root());

    EXPECT_EQ(memdb.get_hash_path(0), tree1.get_hash_path(0));
    EXPECT_EQ(tree1.get_hash_path(0), tree2.get_hash_path(0));

    EXPECT_EQ(memdb.get_hash_path(512), tree1.get_hash_path(512));
    EXPECT_EQ(tree1.get_hash_path(512), tree2.get_hash_path(512));

    for (uint32_t i = 0; i < num_batches; i++) {
        std::vector<fr> batch;
        std::vector<fr_hash_path> memory_tree_hash_paths;
        for (uint32_t j = 0; j < batch_size; j++) {
            batch.push_back(fr(random_engine.get_random_uint256()));
            fr_hash_path path = memdb.update_element(batch[j]);
            memory_tree_hash_paths.push_back(path);
        }
        std::vector<fr_hash_path> tree1_hash_paths;
        std::vector<fr_hash_path> tree2_hash_paths;
        {
            LevelSignal signal(1);
            CompletionCallback completion = [&](std::vector<fr_hash_path>& hash_paths, fr&, index_t) {
                tree1_hash_paths = hash_paths;
                signal.signal_level(0);
            };
            tree1.add_or_update_values(batch, completion);
            signal.wait_for_level(0);
        }
        {
            LevelSignal signal(1);
            CompletionCallback completion = [&](std::vector<fr_hash_path>& hash_paths, fr&, index_t) {
                tree2_hash_paths = hash_paths;
                signal.signal_level(0);
            };
            tree2.add_or_update_values(batch, completion);
            signal.wait_for_level(0);
        }
        EXPECT_EQ(memdb.root(), tree1.root());
        EXPECT_EQ(tree1.root(), tree2.root());

        EXPECT_EQ(memdb.get_hash_path(0), tree1.get_hash_path(0));
        EXPECT_EQ(tree1.get_hash_path(0), tree2.get_hash_path(0));

        EXPECT_EQ(memdb.get_hash_path(512), tree1.get_hash_path(512));
        EXPECT_EQ(tree1.get_hash_path(512), tree2.get_hash_path(512));

        for (uint32_t j = 0; j < batch_size; j++) {
            EXPECT_EQ(tree1_hash_paths[j], tree2_hash_paths[j]);
            // EXPECT_EQ(tree1_hash_paths[j], memory_tree_hash_paths[j]);
        }
    }
}

fr hash_leaf(const indexed_leaf& leaf)
{
    return HashPolicy::hash(leaf.get_hash_inputs());
}

bool check_hash_path(const fr& root, const fr_hash_path& path, const indexed_leaf& leaf_value, const uint32_t idx)
{
    auto current = hash_leaf(leaf_value);
    uint32_t depth_ = static_cast<uint32_t>(path.size());
    uint32_t index = idx;
    for (uint32_t i = 0; i < depth_; ++i) {
        fr left = (index & 1) ? path[i].first : current;
        fr right = (index & 1) ? current : path[i].second;
        current = HashPolicy::hash_pair(left, right);
        index >>= 1;
    }
    return current == root;
}

TEST(crypto_indexed_tree, test_indexed_memory)
{
    ThreadPool workers(8);
    // Create a depth-3 indexed merkle tree
    constexpr uint32_t depth = 3;
    ArrayStore store(depth);
    IndexedTree<ArrayStore, LeavesCache, HashPolicy> tree =
        IndexedTree<ArrayStore, LeavesCache, HashPolicy>(store, depth, workers, 1, "Test Tree 1");

    /**
     * Intial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   0       0       0       0        0       0       0       0
     *  nextVal   0       0       0       0        0       0       0       0
     */
    indexed_leaf zero_leaf = { 0, 0, 0 };
    EXPECT_EQ(tree.size(), 1);
    EXPECT_EQ(tree.get_leaf(0), zero_leaf);

    /**
     * Add new value 30:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       30      0       0        0       0       0       0
     *  nextIdx   1       0       0       0        0       0       0       0
     *  nextVal   30      0       0       0        0       0       0       0
     */
    add_value(tree, 30);
    EXPECT_EQ(tree.size(), 2);
    EXPECT_EQ(hash_leaf(tree.get_leaf(0)), hash_leaf({ 0, 1, 30 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(1)), hash_leaf({ 30, 0, 0 }));

    /**
     * Add new value 10:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       30      10      0        0       0       0       0
     *  nextIdx   2       0       1       0        0       0       0       0
     *  nextVal   10      0       30      0        0       0       0       0
     */
    add_value(tree, 10);
    EXPECT_EQ(tree.size(), 3);
    EXPECT_EQ(hash_leaf(tree.get_leaf(0)), hash_leaf({ 0, 2, 10 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(1)), hash_leaf({ 30, 0, 0 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(2)), hash_leaf({ 10, 1, 30 }));

    /**
     * Add new value 20:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       30      10      20       0       0       0       0
     *  nextIdx   2       0       3       1        0       0       0       0
     *  nextVal   10      0       20      30       0       0       0       0
     */
    add_value(tree, 20);
    EXPECT_EQ(tree.size(), 4);
    EXPECT_EQ(hash_leaf(tree.get_leaf(0)), hash_leaf({ 0, 2, 10 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(1)), hash_leaf({ 30, 0, 0 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(2)), hash_leaf({ 10, 3, 20 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(3)), hash_leaf({ 20, 1, 30 }));

    // Adding the same value must not affect anything
    // tree.update_element(20);
    // EXPECT_EQ(tree.get_leaves().size(), 4);
    // EXPECT_EQ(tree.get_leaves()[0], hash_leaf({ 0, 2, 10 }));
    // EXPECT_EQ(tree.get_leaves()[1], hash_leaf({ 30, 0, 0 }));
    // EXPECT_EQ(tree.get_leaves()[2], hash_leaf({ 10, 3, 20 }));
    // EXPECT_EQ(tree.get_leaves()[3], hash_leaf({ 20, 1, 30 }));

    /**
     * Add new value 50:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       30      10      20       50      0       0       0
     *  nextIdx   2       4       3       1        0       0       0       0
     *  nextVal   10      50      20      30       0       0       0       0
     */
    add_value(tree, 50);
    EXPECT_EQ(tree.size(), 5);
    EXPECT_EQ(hash_leaf(tree.get_leaf(0)), hash_leaf({ 0, 2, 10 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(1)), hash_leaf({ 30, 4, 50 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(2)), hash_leaf({ 10, 3, 20 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(3)), hash_leaf({ 20, 1, 30 }));
    EXPECT_EQ(hash_leaf(tree.get_leaf(4)), hash_leaf({ 50, 0, 0 }));

    // Manually compute the node values
    auto e000 = hash_leaf(tree.get_leaf(0));
    auto e001 = hash_leaf(tree.get_leaf(1));
    auto e010 = hash_leaf(tree.get_leaf(2));
    auto e011 = hash_leaf(tree.get_leaf(3));
    auto e100 = hash_leaf(tree.get_leaf(4));
    auto e101 = fr::zero();
    auto e110 = fr::zero();
    auto e111 = fr::zero();

    auto e00 = HashPolicy::hash_pair(e000, e001);
    auto e01 = HashPolicy::hash_pair(e010, e011);
    auto e10 = HashPolicy::hash_pair(e100, e101);
    auto e11 = HashPolicy::hash_pair(e110, e111);

    auto e0 = HashPolicy::hash_pair(e00, e01);
    auto e1 = HashPolicy::hash_pair(e10, e11);
    auto root = HashPolicy::hash_pair(e0, e1);

    // Check the hash path at index 2 and 3
    // Note: This merkle proof would also serve as a non-membership proof of values in (10, 20) and (20, 30)
    fr_hash_path expected = {
        std::make_pair(e000, e001),
        std::make_pair(e00, e01),
        std::make_pair(e0, e1),
    };
    EXPECT_EQ(tree.get_hash_path(0), expected);
    EXPECT_EQ(tree.get_hash_path(1), expected);
    fr_hash_path expected2 = {
        std::make_pair(e010, e011),
        std::make_pair(e00, e01),
        std::make_pair(e0, e1),
    };
    EXPECT_EQ(tree.get_hash_path(2), expected2);
    EXPECT_EQ(tree.get_hash_path(3), expected2);
    EXPECT_EQ(tree.root(), root);

    // Check the hash path at index 6 and 7
    expected = {
        std::make_pair(e110, e111),
        std::make_pair(e10, e11),
        std::make_pair(e0, e1),
    };
    EXPECT_EQ(tree.get_hash_path(6), expected);
    EXPECT_EQ(tree.get_hash_path(7), expected);
}

// TEST(crypto_indexed_tree, test_indexed_tree)
// {
//     // Create a depth-8 indexed merkle tree
//     constexpr uint32_t depth = 8;
//     ArrayStore store(depth);
//     IndexedTree<ArrayStore, LeavesCache, HashPolicy> tree =
//         IndexedTree<ArrayStore, LeavesCache, HashPolicy>(store, depth, 1);

//     indexed_leaf zero_leaf = { 0, 0, 0 };
//     EXPECT_EQ(tree.size(), 1);
//     EXPECT_EQ(hash_leaf(tree.get_leaf(0)), hash_leaf(zero_leaf));

//     // Add 20 random values to the tree
//     for (uint32_t i = 0; i < 20; i++) {
//         auto value = fr::random_element();
//         tree.add_value(value);
//     }

//     auto abs_diff = [](uint256_t a, uint256_t b) {
//         if (a > b) {
//             return (a - b);
//         } else {
//             return (b - a);
//         }
//     };

//     // Check if a new random value is not a member of this tree.
//     fr new_member = fr::random_element();
//     std::vector<uint256_t> differences;
//     for (uint32_t i = 0; i < uint32_t(tree.size()); i++) {
//         uint256_t diff_hi = abs_diff(uint256_t(new_member), uint256_t(tree.get_leaf(i).value));
//         uint256_t diff_lo = abs_diff(uint256_t(new_member), uint256_t(tree.get_leaf(i).value));
//         differences.push_back(diff_hi + diff_lo);
//     }
//     auto it = std::min_element(differences.begin(), differences.end());
//     auto index = static_cast<uint32_t>(it - differences.begin());

//     // Merkle proof at `index` proves non-membership of `new_member`
//     auto hash_path = tree.get_hash_path(index);
//     EXPECT_TRUE(check_hash_path(tree.root(), hash_path, tree.get_leaf(index), index));
// }