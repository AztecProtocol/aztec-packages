#include <cstdint>
#include <gtest/gtest.h>

#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <stdexcept>
#include <vector>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "lmdb_tree_store.hpp"

using namespace bb::stdlib;
using namespace bb::crypto::merkle_tree;

using Builder = bb::UltraCircuitBuilder;

using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;

class LMDBTreeStoreTest : public testing::Test {
  protected:
    void SetUp() override
    {
        _directory = random_temp_directory();
        _mapSize = 1024 * 1024;
        _maxReaders = 16;
        std::filesystem::create_directories(_directory);
    }

    void TearDown() override { std::filesystem::remove_all(_directory); }

    static std::string _directory;
    static uint64_t _maxReaders;
    static uint64_t _mapSize;
};

std::string LMDBTreeStoreTest::_directory;
uint64_t LMDBTreeStoreTest::_maxReaders;
uint64_t LMDBTreeStoreTest::_mapSize;

TEST_F(LMDBTreeStoreTest, can_write_and_read_block_data)
{
    BlockPayload blockData;
    blockData.blockNumber = 3;
    blockData.root = VALUES[0];
    blockData.size = 45;
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    {
        LMDBTreeWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_block_data(3, blockData, *transaction);
        transaction->commit();
    }

    {
        LMDBTreeReadTransaction::Ptr transaction = store.create_read_transaction();
        BlockPayload readBack;
        bool success = store.read_block_data(3, readBack, *transaction);
        EXPECT_TRUE(success);
        EXPECT_EQ(readBack, blockData);

        success = store.read_block_data(4, readBack, *transaction);
        EXPECT_FALSE(success);
    }
}

TEST_F(LMDBTreeStoreTest, can_write_and_read_meta_data)
{
    TreeMeta metaData;
    metaData.committedSize = 56;
    metaData.initialSize = 12;
    metaData.initialRoot = VALUES[1];
    metaData.root = VALUES[2];
    metaData.depth = 40;
    metaData.finalisedBlockHeight = 87;
    metaData.unfinalisedBlockHeight = 95;
    metaData.name = "Note hash tree";
    metaData.size = 60;
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    {
        LMDBTreeWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_meta_data(metaData, *transaction);
        transaction->commit();
    }

    {
        LMDBTreeReadTransaction::Ptr transaction = store.create_read_transaction();
        TreeMeta readBack;
        bool success = store.read_meta_data(readBack, *transaction);
        EXPECT_TRUE(success);
        EXPECT_EQ(readBack, metaData);
    }
}

TEST_F(LMDBTreeStoreTest, can_write_and_read_leaf_indices)
{
    Indices indices;
    indices.indices.push_back(47);
    indices.indices.push_back(86);
    bb::fr key = VALUES[5];
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    {
        LMDBTreeWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_leaf_indices(key, indices, *transaction);
        transaction->commit();
    }

    {
        LMDBTreeReadTransaction::Ptr transaction = store.create_read_transaction();
        Indices readBack;
        bool success = store.read_leaf_indices(key, readBack, *transaction);
        EXPECT_TRUE(success);
        EXPECT_EQ(readBack, indices);

        success = store.read_leaf_indices(VALUES[6], readBack, *transaction);
        EXPECT_FALSE(success);
    }
}

TEST_F(LMDBTreeStoreTest, can_write_and_read_nodes)
{
    NodePayload nodePayload;
    nodePayload.left = VALUES[4];
    nodePayload.right = VALUES[5];
    nodePayload.ref = 4;
    bb::fr key = VALUES[6];
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    {
        LMDBTreeWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_node(key, nodePayload, *transaction);
        transaction->commit();
    }

    {
        LMDBTreeReadTransaction::Ptr transaction = store.create_read_transaction();
        NodePayload readBack;
        bool success = store.read_node(key, readBack, *transaction);
        EXPECT_TRUE(success);
        EXPECT_EQ(readBack, nodePayload);

        success = store.read_node(VALUES[9], readBack, *transaction);
        EXPECT_FALSE(success);
    }
}

TEST_F(LMDBTreeStoreTest, can_write_and_read_leaves_by_hash)
{
    PublicDataLeafValue leafData;
    leafData.slot = VALUES[0];
    leafData.value = VALUES[1];
    bb::fr key = VALUES[2];
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    {
        LMDBTreeWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_leaf_by_hash(key, leafData, *transaction);
        transaction->commit();
    }

    {
        LMDBTreeReadTransaction::Ptr transaction = store.create_read_transaction();
        PublicDataLeafValue readBack;
        bool success = store.read_leaf_by_hash(key, readBack, *transaction);
        EXPECT_TRUE(success);
        EXPECT_EQ(readBack, leafData);

        success = store.read_leaf_by_hash(VALUES[9], readBack, *transaction);
        EXPECT_FALSE(success);
    }
}
