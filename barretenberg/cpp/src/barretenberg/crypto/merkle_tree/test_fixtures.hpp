
#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <cstdint>
#include <gtest/gtest.h>
#include <optional>

namespace bb::crypto::merkle_tree {

void inline check_block_and_root_data(LMDBTreeStore::SharedPtr db,
                                      block_number_t blockNumber,
                                      fr root,
                                      bool expectedSuccess)
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
    LMDBTreeStore::SharedPtr db, block_number_t blockNumber, fr root, bool expectedSuccess, bool expectedRootSuccess)
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
                                      block_number_t blockNumber,
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
    index_t retrieved = 0;
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    bool success = db->read_leaf_index(leaf, retrieved, *tx);
    EXPECT_EQ(success, entryShouldBePresent);
    if (entryShouldBePresent) {
        EXPECT_EQ(index == retrieved, indexShouldBePresent);
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

template <typename LeafValueType, typename TypeOfTree>
void check_find_leaf_index(TypeOfTree& tree,
                           const std::vector<LeafValueType>& leaves,
                           const std::vector<std::optional<index_t>>& expected_indices,
                           bool expected_success,
                           bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<FindLeafIndexResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (expected_success) {
            EXPECT_EQ(response.inner.leaf_indices, expected_indices);
        }
        signal.signal_level();
    };

    tree.find_leaf_indices(leaves, includeUncommitted, completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void check_find_leaf_index_from(TypeOfTree& tree,
                                const std::vector<LeafValueType>& leaves,
                                index_t start_index,
                                const std::vector<std::optional<index_t>>& expected_indices,
                                bool expected_success,
                                bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<FindLeafIndexResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (expected_success) {
            EXPECT_EQ(response.inner.leaf_indices, expected_indices);
        }
        signal.signal_level();
    };

    tree.find_leaf_indices_from(leaves, start_index, includeUncommitted, completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void check_historic_find_leaf_index(TypeOfTree& tree,
                                    const std::vector<LeafValueType>& leaves,
                                    block_number_t blockNumber,
                                    const std::vector<std::optional<index_t>>& expected_indices,
                                    bool expected_success,
                                    bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<FindLeafIndexResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (expected_success) {
            EXPECT_EQ(response.inner.leaf_indices, expected_indices);
        }
        signal.signal_level();
    };

    tree.find_leaf_indices(leaves, blockNumber, includeUncommitted, completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void check_historic_find_leaf_index_from(TypeOfTree& tree,
                                         const std::vector<LeafValueType>& leaves,
                                         block_number_t blockNumber,
                                         index_t start_index,
                                         const std::vector<std::optional<index_t>>& expected_indices,
                                         bool expected_success,
                                         bool includeUncommitted = true)
{
    Signal signal;
    auto completion = [&](const TypedResponse<FindLeafIndexResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (expected_success) {
            EXPECT_EQ(response.inner.leaf_indices, expected_indices);
        }
        signal.signal_level();
    };

    tree.find_leaf_indices_from(leaves, start_index, blockNumber, includeUncommitted, completion);
    signal.wait_for_level();
}

template <typename LeafValueType, typename TypeOfTree>
void check_find_leaf_index(TypeOfTree& tree,
                           const LeafValueType& leaf,
                           index_t expected_index,
                           bool expected_success,
                           bool includeUncommitted = true)
{
    check_find_leaf_index<LeafValueType, TypeOfTree>(
        tree, { leaf }, { std::make_optional(expected_index) }, expected_success, includeUncommitted);
}

template <typename LeafValueType, typename TypeOfTree>
void check_find_leaf_index_from(TypeOfTree& tree,
                                const LeafValueType& leaf,
                                index_t start_index,
                                index_t expected_index,
                                bool expected_success,
                                bool includeUncommitted = true)
{
    check_find_leaf_index_from<LeafValueType, TypeOfTree>(
        tree, { leaf }, start_index, { std::make_optional(expected_index) }, expected_success, includeUncommitted);
}

template <typename LeafValueType, typename TypeOfTree>
void check_historic_find_leaf_index(TypeOfTree& tree,
                                    const LeafValueType& leaf,
                                    block_number_t blockNumber,
                                    index_t expected_index,
                                    bool expected_success,
                                    bool includeUncommitted = true)
{
    check_historic_find_leaf_index<LeafValueType, TypeOfTree>(
        tree, { leaf }, blockNumber, { std::make_optional(expected_index) }, expected_success, includeUncommitted);
}

template <typename LeafValueType, typename TypeOfTree>
void check_historic_find_leaf_index_from(TypeOfTree& tree,
                                         const LeafValueType& leaf,
                                         block_number_t blockNumber,
                                         index_t start_index,
                                         index_t expected_index,
                                         bool expected_success,
                                         bool includeUncommitted = true)
{
    check_historic_find_leaf_index_from<LeafValueType, TypeOfTree>(tree,
                                                                   { leaf },
                                                                   blockNumber,
                                                                   start_index,
                                                                   { std::make_optional(expected_index) },
                                                                   expected_success,
                                                                   includeUncommitted);
}

template <typename TypeOfTree>
fr_sibling_path get_sibling_path(TypeOfTree& tree,
                                 index_t index,
                                 bool includeUncommitted = true,
                                 bool expected_success = true)
{
    fr_sibling_path h;
    Signal signal;
    auto completion = [&](const TypedResponse<GetSiblingPathResponse>& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        if (response.success) {
            h = response.inner.path;
        }
        signal.signal_level();
    };
    tree.get_sibling_path(index, completion, includeUncommitted);
    signal.wait_for_level();
    return h;
}

} // namespace bb::crypto::merkle_tree