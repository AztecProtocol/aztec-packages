
#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <cstdint>
#include <gtest/gtest.h>

namespace bb::crypto::merkle_tree {

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

} // namespace bb::crypto::merkle_tree