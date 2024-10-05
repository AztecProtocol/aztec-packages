#pragma once

#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <cstdint>
#include <gtest/gtest.h>
#include <ostream>
#include <sstream>
#include <string>
#include <vector>

namespace bb::crypto::merkle_tree {

const uint32_t NUM_VALUES = 1024;
inline auto& engine = numeric::get_debug_randomness();
inline auto& random_engine = numeric::get_randomness();

static auto create_values = [](uint32_t num_values = NUM_VALUES) {
    std::vector<fr> values(num_values);
    for (uint32_t i = 0; i < num_values; ++i) {
        values[i] = fr(random_engine.get_random_uint256());
    }
    return values;
};

static std::vector<fr> VALUES = create_values();

inline std::string random_string()
{
    std::stringstream ss;
    ss << random_engine.get_random_uint256();
    return ss.str();
}

inline std::string random_temp_directory()
{
    std::stringstream ss;
    ss << "/tmp/lmdb/" << random_string();
    return ss.str();
}

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

using ThreadPoolPtr = std::shared_ptr<ThreadPool>;

inline ThreadPoolPtr make_thread_pool(uint64_t numThreads)
{
    return std::make_shared<ThreadPool>(numThreads);
}

void inline check_block_and_root_data(LMDBTreeStore::SharedPtr db, index_t blockNumber, fr root, bool expectedSuccess)
{
    BlockPayload blockData;
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    bool success = db->read_block_data(blockNumber, blockData, *tx);
    EXPECT_EQ(success, expectedSuccess);
    if (expectedSuccess) {
        EXPECT_EQ(blockData.root, root);
    }
    NodePayload nodeData;
    success = db->read_node(root, nodeData, *tx);
    EXPECT_EQ(success, expectedSuccess);
}

void inline check_block_and_root_data(
    LMDBTreeStore::SharedPtr db, index_t blockNumber, fr root, bool expectedSuccess, bool expectedRootSuccess)
{
    BlockPayload blockData;
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    bool success = db->read_block_data(blockNumber, blockData, *tx);
    EXPECT_EQ(success, expectedSuccess);
    if (expectedSuccess) {
        EXPECT_EQ(blockData.root, root);
    }
    NodePayload nodeData;
    success = db->read_node(root, nodeData, *tx);
    EXPECT_EQ(success, expectedRootSuccess);
}

void inline check_block_and_size_data(LMDBTreeStore::SharedPtr db,
                                      index_t blockNumber,
                                      index_t expectedSize,
                                      bool expectedSuccess)
{
    BlockPayload blockData;
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    bool success = db->read_block_data(blockNumber, blockData, *tx);
    EXPECT_EQ(success, expectedSuccess);
    if (expectedSuccess) {
        EXPECT_EQ(blockData.size, expectedSize);
    }
}

void inline check_indices_data(
    LMDBTreeStore::SharedPtr db, fr leaf, index_t index, bool entryShouldBePresent, bool indexShouldBePresent)
{
    Indices indices;
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    bool success = db->read_leaf_indices(leaf, indices, *tx);
    EXPECT_EQ(success, entryShouldBePresent);
    if (entryShouldBePresent) {
        bool found = std::find(indices.indices.begin(), indices.indices.end(), index) != std::end(indices.indices);
        EXPECT_EQ(found, indexShouldBePresent);
    }
}

template <typename LeafType, typename Hash>
void check_leaf_by_hash(LMDBTreeStore::SharedPtr db, IndexedLeaf<LeafType> leaf, bool shouldBePresent)
{
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    IndexedLeaf<LeafType> fromStore;
    bool success = db->read_leaf_by_hash(Hash::hash(leaf.get_hash_inputs()), fromStore, *tx);
    EXPECT_EQ(success, shouldBePresent);
    if (success) {
        EXPECT_EQ(fromStore, leaf);
    }
}

void inline check_leaf_keys_are_present(LMDBTreeStore::SharedPtr db,
                                        uint64_t startIndex,
                                        uint64_t endIndex,
                                        const std::vector<fr>& keys)
{
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    for (uint64_t i = startIndex; i <= endIndex; i++) {
        fr leafKey;
        bool success = db->read_leaf_key_by_index(i, leafKey, *tx);
        EXPECT_TRUE(success);
        EXPECT_EQ(leafKey, keys[i - startIndex]);
    }
}

void inline check_leaf_keys_are_not_present(LMDBTreeStore::SharedPtr db, uint64_t startIndex, uint64_t endIndex)
{
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    for (uint64_t i = startIndex; i < endIndex; i++) {
        fr leafKey;
        bool success = db->read_leaf_key_by_index(i, leafKey, *tx);
        EXPECT_FALSE(success);
    }
}

void inline print_store_data(LMDBTreeStore::SharedPtr db, std::ostream& os)
{
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    StatsMap stats;
    db->get_stats(stats, *tx);

    for (const auto& m : stats) {
        os << m.first << m.second << std::endl;
    }
}
} // namespace bb::crypto::merkle_tree