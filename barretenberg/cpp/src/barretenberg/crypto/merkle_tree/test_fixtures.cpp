#include "barretenberg/crypto/merkle_tree/test_fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"

namespace bb::crypto::merkle_tree {
void check_block_and_root_data(LMDBTreeStore::SharedPtr db, block_number_t blockNumber, fr root, bool expectedSuccess)
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

void check_block_and_root_data(
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

void check_block_and_size_data(LMDBTreeStore::SharedPtr db,
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

void check_indices_data(
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

void call_operation(std::function<void(std::function<void(const Response& response)>)> operation, bool expected_success)
{
    Signal signal;
    auto completion = [&](const Response& response) -> void {
        EXPECT_EQ(response.success, expected_success);
        signal.signal_level();
    };
    operation(completion);
    signal.wait_for_level();
}
} // namespace bb::crypto::merkle_tree