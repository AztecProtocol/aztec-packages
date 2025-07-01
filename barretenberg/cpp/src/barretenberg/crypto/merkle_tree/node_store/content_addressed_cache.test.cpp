#include "barretenberg/crypto/merkle_tree/node_store/content_addressed_cache.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <vector>

using namespace bb;
using namespace bb::crypto::merkle_tree;

using LeafValueType = PublicDataLeafValue;
using IndexedLeafType = IndexedLeaf<PublicDataLeafValue>;
using CacheType = ContentAddressedCache<PublicDataLeafValue>;

class ContentAddressedCacheTest : public testing::Test {
  protected:
    void SetUp() override {}
    void TearDown() override{};
};

uint64_t get_index(uint64_t max_index = 0)
{
    uint64_t result = random_engine.get_random_uint64();
    return max_index == 0 ? 0 : result % max_index;
}

void add_to_cache(
    CacheType& cache, index_t leaf_offset, uint64_t num_leaves, uint64_t num_nodes, uint64_t max_index = 0)
{
    for (uint64_t i = 0; i < num_leaves; i++) {
        fr slot = fr::random_element();
        fr value = fr::random_element();
        index_t next_index = get_index(max_index);
        fr next_value = fr::random_element();
        IndexedLeafType leaf_preimage = IndexedLeafType(LeafValueType(slot, value), next_index, next_value);
        fr leaf_hash = fr::random_element();
        cache.put_leaf_by_index(i + leaf_offset, leaf_preimage);
        cache.put_leaf_preimage_by_hash(leaf_hash, leaf_preimage);
        cache.update_leaf_key_index(i + leaf_offset, leaf_preimage.leaf.get_key());
    }

    for (uint64_t i = 0; i < num_nodes; i++) {
        fr node_hash = fr::random_element();
        NodePayload node = { fr::random_element(), fr::random_element(), 0 };
        cache.put_node(node_hash, node);

        uint32_t level = uint32_t(i % uint64_t(cache.get_meta().depth));
        index_t max_index_at_level = 1;
        max_index_at_level <<= level;
        max_index_at_level--;
        index_t index = get_index(max_index_at_level);
        cache.put_node_by_index(level, index, node_hash);
    }

    TreeMeta meta = cache.get_meta();
    meta.size += num_leaves;
    cache.put_meta(meta);
}

CacheType create_cache(uint32_t depth)
{
    TreeMeta meta;
    meta.depth = depth;
    meta.size = 0;
    CacheType cache(depth);
    cache.put_meta(meta);
    return cache;
}

TEST_F(ContentAddressedCacheTest, can_create_cache)
{
    constexpr uint32_t depth = 10;
    EXPECT_NO_THROW(CacheType cache(depth));
}

TEST_F(ContentAddressedCacheTest, can_checkpoint_cache)
{
    CacheType cache = create_cache(10);
    add_to_cache(cache, 0, 10, 100);
    EXPECT_NO_THROW(cache.checkpoint());
}

TEST_F(ContentAddressedCacheTest, can_not_revert_cache_without_checkpoint)
{
    CacheType cache = create_cache(10);
    EXPECT_THROW(cache.revert(), std::runtime_error);
}

TEST_F(ContentAddressedCacheTest, can_not_commit_cache_without_checkpoint)
{
    CacheType cache = create_cache(10);
    EXPECT_THROW(cache.commit(), std::runtime_error);
}

// Adds 4 node hashes by the given level and index
// Returns the 4 hashes
std::vector<fr> setup_nodes_test(uint32_t level, uint64_t index, CacheType& cache)
{
    // Now add a new node
    fr node_hash_1 = fr::random_element();
    cache.put_node_by_index(level, index, node_hash_1);

    // Now add a new value at the same location
    fr node_hash_2 = fr::random_element();
    cache.put_node_by_index(level, index, node_hash_2);

    // Checkpoint again
    cache.checkpoint();
    fr node_hash_3 = fr::random_element();
    cache.put_node_by_index(level, index, node_hash_3);

    // Now add a new value at the same location
    fr node_hash_4 = fr::random_element();
    cache.put_node_by_index(level, index, node_hash_4);
    return { node_hash_1, node_hash_2, node_hash_3, node_hash_4 };
}

TEST_F(ContentAddressedCacheTest, commit_then_revert_nodes)
{
    CacheType cache = create_cache(10);
    cache.checkpoint();
    uint32_t level = 5;
    uint64_t index = 15;

    std::vector<fr> hashes = setup_nodes_test(level, index, cache);
    fr node_hash_4 = hashes[3];
    // Check current node value
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_4);

    // Commit the last checkpoint
    cache.commit();
    // Check current node value
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_4);

    // Revert the next checkpoint, there should be no node at this location
    cache.revert();
    EXPECT_FALSE(cache.get_node_by_index(level, index).has_value());
}

TEST_F(ContentAddressedCacheTest, commit_then_commit_nodes)
{
    CacheType cache = create_cache(10);
    cache.checkpoint();
    uint32_t level = 5;
    uint64_t index = 15;
    std::vector<fr> hashes = setup_nodes_test(level, index, cache);
    fr node_hash_4 = hashes[3];

    // Check current node value
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_4);

    // Commit the last checkpoint
    cache.commit();
    // Check current node value
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_4);

    // Commit again and we should still have the same node
    cache.commit();
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_4);
}

TEST_F(ContentAddressedCacheTest, revert_then_commit_nodes)
{
    CacheType cache = create_cache(10);
    cache.checkpoint();
    uint32_t level = 5;
    uint64_t index = 15;
    std::vector<fr> hashes = setup_nodes_test(level, index, cache);
    fr node_hash_4 = hashes[3];
    fr node_hash_2 = hashes[1];

    // Check current node value
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_4);

    // Revert the last checkpoint
    cache.revert();
    // Check current node value
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_2);

    // Commit the next checkpoint
    cache.commit();
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_2);
}

TEST_F(ContentAddressedCacheTest, revert_then_revert_nodes)
{
    CacheType cache = create_cache(10);
    cache.checkpoint();
    uint32_t level = 5;
    uint64_t index = 15;
    std::vector<fr> hashes = setup_nodes_test(level, index, cache);
    fr node_hash_4 = hashes[3];
    fr node_hash_2 = hashes[1];

    // Check current node value
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_4);

    // Revert the last checkpoint
    cache.revert();
    // Check current node value
    EXPECT_EQ(cache.get_node_by_index(level, index).value(), node_hash_2);

    // Revert the next checkpoint, should be no node at this location
    cache.revert();
    EXPECT_FALSE(cache.get_node_by_index(level, index).has_value());
}

std::optional<IndexedLeafType> get_leaf_by_index(CacheType& cache, index_t index)
{
    IndexedLeafType leaf;
    if (cache.get_leaf_by_index(index, leaf)) {
        return leaf;
    }
    return std::nullopt;
}

// Adds 4 leaf values at the given index
// Return all 4 leaves
std::vector<IndexedLeafType> setup_leaves_tests(uint32_t index, CacheType& cache)
{
    fr slot = fr::random_element();
    fr value1 = fr::random_element();
    index_t next_index = 15;
    fr next_value = fr::random_element();
    // Now add a new node
    IndexedLeafType leaf_preimage1 = IndexedLeafType(LeafValueType(slot, value1), next_index, next_value);
    cache.put_leaf_by_index(index, leaf_preimage1);
    cache.update_leaf_key_index(index, leaf_preimage1.leaf.get_key());

    // Now add a new value at the same location
    fr value2 = fr::random_element();
    IndexedLeafType leaf_preimage2 = IndexedLeafType(LeafValueType(slot, value2), next_index, next_value);
    cache.put_leaf_by_index(index, leaf_preimage2);
    cache.update_leaf_key_index(index, leaf_preimage2.leaf.get_key());

    // Checkpoint again
    cache.checkpoint();
    fr value3 = fr::random_element();
    IndexedLeafType leaf_preimage3 = IndexedLeafType(LeafValueType(slot, value3), next_index, next_value);
    cache.put_leaf_by_index(index, leaf_preimage3);
    cache.update_leaf_key_index(index, leaf_preimage3.leaf.get_key());

    // Now add a new value at the same location
    fr value4 = fr::random_element();
    IndexedLeafType leaf_preimage4 = IndexedLeafType(LeafValueType(slot, value4), next_index, next_value);
    cache.put_leaf_by_index(index, leaf_preimage4);
    cache.update_leaf_key_index(index, leaf_preimage4.leaf.get_key());
    return { leaf_preimage1, leaf_preimage2, leaf_preimage3, leaf_preimage4 };
}

TEST_F(ContentAddressedCacheTest, commit_then_revert_leaves)
{
    CacheType cache = create_cache(10);
    cache.checkpoint();

    uint32_t index = 67;
    std::vector<IndexedLeafType> leaves = setup_leaves_tests(index, cache);
    IndexedLeafType leaf_preimage4 = leaves[3];

    // Check current leaf value
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage4);

    // Verify the indices store
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).value(), index);

    // Commit the last checkpoint
    cache.commit();
    // Check current leaf value
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage4);

    // Verify the indices store
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).value(), index);

    // Revert the next checkpoint, there should be no leaf at this location
    cache.revert();
    EXPECT_FALSE(get_leaf_by_index(cache, index).has_value());
    EXPECT_FALSE(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).has_value());
}

TEST_F(ContentAddressedCacheTest, commit_then_commit_leaves)
{
    CacheType cache = create_cache(10);
    cache.checkpoint();

    uint32_t index = 67;
    std::vector<IndexedLeafType> leaves = setup_leaves_tests(index, cache);
    IndexedLeafType leaf_preimage4 = leaves[3];

    // Check current leaf value
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage4);

    // Verify the indices store
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).value(), index);

    // Commit the last checkpoint
    cache.commit();
    // Check current leaf value
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage4);

    // Verify the indices store
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).value(), index);

    // Commit the next checkpoint, should still have the same leaf
    cache.commit();
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage4);

    // Verify the indices store
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).value(), index);
}

TEST_F(ContentAddressedCacheTest, revert_then_commit_leaves)
{
    CacheType cache = create_cache(10);
    cache.checkpoint();

    uint32_t index = 67;
    std::vector<IndexedLeafType> leaves = setup_leaves_tests(index, cache);
    IndexedLeafType leaf_preimage4 = leaves[3];
    IndexedLeafType leaf_preimage2 = leaves[1];

    // Check current leaf value
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage4);

    // Verify the indices store
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).value(), index);

    // Revert the last checkpoint
    cache.revert();
    // Check current leaf value
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage2);

    // Verify the indices store still has the key at the same index
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage2.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage2.leaf.get_key()).value(), index);

    // Commit the next checkpoint, should still have the same leaf
    cache.commit();
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage2);

    // Verify the indices store
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage2.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage2.leaf.get_key()).value(), index);
}

TEST_F(ContentAddressedCacheTest, revert_then_revert_leaves)
{
    CacheType cache = create_cache(10);
    cache.checkpoint();

    uint32_t index = 67;
    std::vector<IndexedLeafType> leaves = setup_leaves_tests(index, cache);
    IndexedLeafType leaf_preimage4 = leaves[3];
    IndexedLeafType leaf_preimage2 = leaves[1];

    // Check current leaf value
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage4);

    // Verify the indices store
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage4.leaf.get_key()).value(), index);

    // Revert the last checkpoint
    cache.revert();
    // Check current leaf value
    EXPECT_TRUE(get_leaf_by_index(cache, index).has_value());
    EXPECT_EQ(get_leaf_by_index(cache, index).value(), leaf_preimage2);

    // Verify the indices store still has the key at the same index
    EXPECT_TRUE(cache.get_leaf_key_index(leaf_preimage2.leaf.get_key()).has_value());
    EXPECT_EQ(cache.get_leaf_key_index(leaf_preimage2.leaf.get_key()).value(), index);

    // Revert the next checkpoint, there should be no leaf at this location
    cache.revert();
    EXPECT_FALSE(get_leaf_by_index(cache, index).has_value());
    EXPECT_FALSE(cache.get_leaf_key_index(leaf_preimage2.leaf.get_key()).has_value());
}

TEST_F(ContentAddressedCacheTest, can_revert_cache)
{
    CacheType cache = create_cache(40);
    add_to_cache(cache, 0, 1000, 10000);
    CacheType cache_copy = cache;
    cache.checkpoint();
    add_to_cache(cache, 1000, 1000, 10000);
    EXPECT_NO_THROW(cache.revert());
}

TEST_F(ContentAddressedCacheTest, can_commit_cache)
{
    CacheType cache = create_cache(40);
    add_to_cache(cache, 0, 1000, 10000);
    CacheType cache_copy = cache;
    cache.checkpoint();
    add_to_cache(cache, 1000, 1000, 10000);
    CacheType cache_copy_2 = cache;
    cache.checkpoint();
    add_to_cache(cache, 2000, 1000, 10000);
    EXPECT_NO_THROW(cache.revert());
    EXPECT_TRUE(cache_copy_2.is_equivalent_to(cache));
    cache.commit();
    EXPECT_TRUE(cache_copy_2.is_equivalent_to(cache));
}

TEST_F(ContentAddressedCacheTest, can_commit_all)
{
    CacheType cache = create_cache(40);
    cache.checkpoint();
    add_to_cache(cache, 0, 1000, 10000);
    cache.checkpoint();
    add_to_cache(cache, 1000, 1000, 10000);
    cache.checkpoint();
    add_to_cache(cache, 2000, 1000, 10000);
    CacheType final_cache = cache;

    cache.commit_all();

    // Should no longer be able to revert, no checkpoints left
    // Should no longer be able to revert or commit
    EXPECT_THROW(cache.commit(), std::runtime_error);
    EXPECT_THROW(cache.revert(), std::runtime_error);

    EXPECT_TRUE(final_cache.is_equivalent_to(cache));
}

TEST_F(ContentAddressedCacheTest, can_revert_all)
{
    CacheType cache = create_cache(40);
    add_to_cache(cache, 0, 1000, 10000);
    CacheType original_cache = cache;
    cache.checkpoint();
    add_to_cache(cache, 1000, 1000, 10000);
    cache.checkpoint();
    add_to_cache(cache, 2000, 1000, 10000);

    // Revert all checkpoints
    cache.revert_all();

    // Should no longer be able to revert or commit
    EXPECT_THROW(cache.commit(), std::runtime_error);
    EXPECT_THROW(cache.revert(), std::runtime_error);

    EXPECT_TRUE(original_cache.is_equivalent_to(cache));
}

TEST_F(ContentAddressedCacheTest, can_revert_through_multiple_levels)
{
    uint64_t num_levels = 10;
    CacheType cache = create_cache(40);
    add_to_cache(cache, 0, 1000, 10000);

    std::vector<CacheType> copies;

    for (uint64_t i = 0; i < num_levels; i++) {
        copies.push_back(cache);
        cache.checkpoint();
        add_to_cache(cache, (i + 1) * 1000, 1000, 10000);
    }

    for (uint64_t i = 0; i < num_levels; i++) {
        cache.revert();
        EXPECT_TRUE(copies[num_levels - i - 1].is_equivalent_to(cache));
    }
}

TEST_F(ContentAddressedCacheTest, can_commit_through_multiple_levels)
{
    uint64_t num_levels = 10;
    CacheType cache = create_cache(40);
    add_to_cache(cache, 0, 1000, 10000);

    for (uint64_t i = 0; i < num_levels; i++) {
        cache.checkpoint();
        add_to_cache(cache, (i + 1) * 1000, 1000, 10000);
    }

    CacheType cache_copy = cache;

    for (uint64_t i = 0; i < num_levels; i++) {
        cache.commit();
    }

    EXPECT_TRUE(cache_copy.is_equivalent_to(cache));
}

void test_reverts_remove_all_deeper_commits(uint64_t max_index, uint32_t depth, uint64_t num_levels)
{
    CacheType cache = create_cache(depth);
    add_to_cache(cache, 0, 1000, 10000, max_index);

    CacheType base_cache = cache;

    cache.checkpoint();
    add_to_cache(cache, 1000, 1000, 10000, max_index);
    CacheType first_commit_cache = cache;

    // make lots more checkpoints and changes
    for (uint64_t i = 1; i < num_levels; i++) {
        cache.checkpoint();
        add_to_cache(cache, (i + 1) * 1000, 1000, 10000, max_index);
    }

    CacheType final_cache = cache;

    // commit everything except the the first checkpoint
    for (uint64_t i = 1; i < num_levels; i++) {
        cache.commit();
    }

    // we should still be equivalent to the final commit cache
    EXPECT_TRUE(final_cache.is_equivalent_to(cache));

    // reverting this final checkpoint reverts eveything else
    cache.revert();
    EXPECT_TRUE(base_cache.is_equivalent_to(cache));
}

TEST_F(ContentAddressedCacheTest, reverts_remove_all_deeper_commits)
{
    // We execute this test using 2 different values for max index to produce slightly different behaviour
    // A lower value will encourage more updates to existing nodes
    // A higher value will mean more new nodes are added
    uint32_t depth = 40;
    std::array<uint64_t, 2> max_indices = { 100, 1000000 };
    uint64_t num_levels = 10;

    for (uint64_t max_index : max_indices) {
        test_reverts_remove_all_deeper_commits(max_index, depth, num_levels);
    }
}

void reverts_remove_all_deeper_commits_2(uint64_t max_index, uint32_t depth, uint64_t num_levels)
{
    CacheType cache = create_cache(depth);
    add_to_cache(cache, 0, 1000, 10000, max_index);

    CacheType base_cache = cache;

    cache.checkpoint();
    add_to_cache(cache, 1000, 1000, 10000, max_index);
    CacheType first_commit_cache = cache;

    // make lots more checkpoints and changes
    for (uint64_t i = 1; i < num_levels; i++) {
        cache.checkpoint();
        add_to_cache(cache, (i + 1) * 1000, 1000, 10000, max_index);
    }

    for (uint64_t i = 1; i < num_levels; i++) {
        if (i % 2 != 0) {
            cache.revert();
        } else {
            cache.commit();
        }
    }

    // we should still be equivalent to the first commit cache
    EXPECT_TRUE(first_commit_cache.is_equivalent_to(cache));

    // reverting this final checkpoint reverts eveything else
    cache.revert();
    EXPECT_TRUE(base_cache.is_equivalent_to(cache));
}

TEST_F(ContentAddressedCacheTest, reverts_remove_all_deeper_commits_2)
{
    // We execute this test using 2 different values for max index to produce slightly different behaviour
    // A lower value will encourage more updates to existing nodes
    // A higher value will mean more new nodes are added
    uint64_t num_levels = 10;
    uint32_t depth = 40;
    std::array<uint64_t, 2> max_indices = { 100, 1000000 };
    for (uint64_t max_index : max_indices) {
        reverts_remove_all_deeper_commits_2(max_index, depth, num_levels);
    }
}
