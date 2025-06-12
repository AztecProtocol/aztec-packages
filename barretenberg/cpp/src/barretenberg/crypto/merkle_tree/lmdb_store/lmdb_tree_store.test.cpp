#include <cstddef>
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
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/lmdblib/lmdb_helpers.hpp"
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
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_block_data(3, blockData, *transaction);
        transaction->commit();
    }

    {
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
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
    metaData.oldestHistoricBlock = 87;
    metaData.unfinalisedBlockHeight = 95;
    metaData.name = "Note hash tree";
    metaData.size = 60;
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    {
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_meta_data(metaData, *transaction);
        transaction->commit();
    }

    {
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        TreeMeta readBack;
        bool success = store.read_meta_data(readBack, *transaction);
        EXPECT_TRUE(success);
        EXPECT_EQ(readBack, metaData);
    }
}

TEST_F(LMDBTreeStoreTest, can_read_data_from_multiple_threads)
{
    TreeMeta metaData;
    metaData.committedSize = 56;
    metaData.initialSize = 12;
    metaData.initialRoot = VALUES[1];
    metaData.root = VALUES[2];
    metaData.depth = 40;
    metaData.oldestHistoricBlock = 87;
    metaData.unfinalisedBlockHeight = 95;
    metaData.name = "Note hash tree";
    metaData.size = 60;
    LMDBTreeStore store(_directory, "DB1", _mapSize, 2);
    {
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_meta_data(metaData, *transaction);
        transaction->commit();
    }

    uint64_t numIterationsPerThread = 1000;
    uint32_t numThreads = 16;

    {
        auto func = [&]() -> void {
            for (uint64_t iteration = 0; iteration < numIterationsPerThread; iteration++) {
                LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
                TreeMeta readBack;
                bool success = store.read_meta_data(readBack, *transaction);
                EXPECT_TRUE(success);
                EXPECT_EQ(readBack, metaData);
            }
        };
        std::vector<std::unique_ptr<std::thread>> threads;
        for (uint64_t count = 0; count < numThreads; count++) {
            threads.emplace_back(std::make_unique<std::thread>(func));
        }
        for (uint64_t count = 0; count < numThreads; count++) {
            threads[count]->join();
        }
    }
}

TEST_F(LMDBTreeStoreTest, can_write_and_read_multiple_blocks_with_meta)
{
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    block_number_t start_block = 647810461;
    block_number_t num_blocks = 1000;
    for (block_number_t i = 0; i < num_blocks; i++) {
        BlockPayload blockData;
        blockData.blockNumber = i + start_block;
        blockData.root = VALUES[i];
        blockData.size = 45 + (i * 97);
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_block_data(i + start_block, blockData, *transaction);

        TreeMeta meta;
        meta.committedSize = blockData.size;
        meta.size = blockData.size;
        meta.root = blockData.root;
        meta.depth = 32;
        meta.unfinalisedBlockHeight = i + start_block;
        meta.name = "NullifierTree";
        store.write_meta_data(meta, *transaction);
        transaction->commit();
    }

    BlockPayload blockData;
    for (block_number_t i = 0; i < num_blocks; i++) {
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        BlockPayload readBack;
        bool success = store.read_block_data(i + start_block, readBack, *transaction);
        EXPECT_TRUE(success);

        blockData.blockNumber = i + start_block;
        blockData.root = VALUES[i];
        blockData.size = 45 + (i * 97);
        EXPECT_EQ(readBack, blockData);
    }

    {
        TreeMeta meta;
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        store.read_meta_data(meta, *transaction);

        EXPECT_EQ(meta.committedSize, blockData.size);
        EXPECT_EQ(meta.size, blockData.size);
        EXPECT_EQ(meta.root, blockData.root);
        EXPECT_EQ(meta.depth, 32);
        EXPECT_EQ(meta.unfinalisedBlockHeight, blockData.blockNumber);
        EXPECT_EQ(meta.name, "NullifierTree");
    }
}

uint64_t serde_value(uint64_t value)
{
    std::vector<uint8_t> data = serialise_key(value);
    uint64_t return_value = 0;
    deserialise_key(data.data(), return_value);
    return return_value;
}

TEST_F(LMDBTreeStoreTest, can_serde_64bit_values)
{
    union mapped {
        uint64_t u64;
        uint8_t arr[8];
    };
    mapped value1;
    mapped value2;
    value1.arr[0] = value2.arr[7] = 0x11;
    value1.arr[1] = value2.arr[6] = 0x22;
    value1.arr[2] = value2.arr[5] = 0x33;
    value1.arr[3] = value2.arr[4] = 0x44;
    value1.arr[4] = value2.arr[3] = 0x55;
    value1.arr[5] = value2.arr[2] = 0x66;
    value1.arr[6] = value2.arr[1] = 0x77;
    value1.arr[7] = value2.arr[0] = 0x88;

    EXPECT_EQ(value1.u64, serde_value(value1.u64));
    EXPECT_EQ(value2.u64, serde_value(value2.u64));
}

TEST_F(LMDBTreeStoreTest, can_write_and_read_leaf_indices)
{
    index_t index = 47;
    bb::fr key = VALUES[5];
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    {
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_leaf_index(key, index, *transaction);
        transaction->commit();
    }

    {
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        index_t readBack = 0;
        bool success = store.read_leaf_index(key, readBack, *transaction);
        EXPECT_TRUE(success);
        EXPECT_EQ(readBack, index);

        success = store.read_leaf_index(VALUES[6], readBack, *transaction);
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
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_node(key, nodePayload, *transaction);
        transaction->commit();
    }

    {
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
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
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        store.write_leaf_by_hash(key, leafData, *transaction);
        transaction->commit();
    }

    {
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        PublicDataLeafValue readBack;
        bool success = store.read_leaf_by_hash(key, readBack, *transaction);
        EXPECT_TRUE(success);
        EXPECT_EQ(readBack, leafData);

        success = store.read_leaf_by_hash(VALUES[9], readBack, *transaction);
        EXPECT_FALSE(success);
    }
}

TEST_F(LMDBTreeStoreTest, can_write_and_retrieve_block_numbers_by_index)
{
    struct BlockAndIndex {
        block_number_t blockNumber;
        // this block contains leaves up to index (0 based)
        index_t index;
    };

    std::vector<BlockAndIndex> blocks{ BlockAndIndex{ .blockNumber = 1, .index = 25 },
                                       BlockAndIndex{ .blockNumber = 2, .index = 60 },
                                       BlockAndIndex{ .blockNumber = 3, .index = 82 },
                                       BlockAndIndex{ .blockNumber = 4, .index = 114 },
                                       BlockAndIndex{ .blockNumber = 5, .index = 130 } };
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    {
        // write all of the blocks.
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        for (auto block : blocks) {
            // the arg is block size so add 1
            store.write_block_index_data(block.blockNumber, block.index + 1, *transaction);
        }
        transaction->commit();
    }

    {
        // read back some blocks and check them
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        block_number_t readBack = 0;
        EXPECT_TRUE(store.find_block_for_index(5, readBack, *transaction));
        EXPECT_EQ(readBack, 1);

        EXPECT_TRUE(store.find_block_for_index(30, readBack, *transaction));
        EXPECT_EQ(readBack, 2);

        EXPECT_TRUE(store.find_block_for_index(82, readBack, *transaction));
        EXPECT_EQ(readBack, 3);

        EXPECT_TRUE(store.find_block_for_index(83, readBack, *transaction));
        EXPECT_EQ(readBack, 4);

        EXPECT_TRUE(store.find_block_for_index(130, readBack, *transaction));
        EXPECT_EQ(readBack, 5);

        EXPECT_FALSE(store.find_block_for_index(131, readBack, *transaction));
    }

    {
        // delete the last block
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        // the arg is block size so add 1
        store.delete_block_index(blocks[4].index + 1, blocks[4].blockNumber, *transaction);
        transaction->commit();
    }

    {
        // check the blocks again
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        block_number_t readBack = 0;
        EXPECT_TRUE(store.find_block_for_index(5, readBack, *transaction));
        EXPECT_EQ(readBack, 1);

        EXPECT_TRUE(store.find_block_for_index(30, readBack, *transaction));
        EXPECT_EQ(readBack, 2);

        EXPECT_TRUE(store.find_block_for_index(82, readBack, *transaction));
        EXPECT_EQ(readBack, 3);

        EXPECT_TRUE(store.find_block_for_index(83, readBack, *transaction));
        EXPECT_EQ(readBack, 4);

        EXPECT_FALSE(store.find_block_for_index(130, readBack, *transaction));

        EXPECT_FALSE(store.find_block_for_index(131, readBack, *transaction));
    }

    {
        // delete 2 more blocks
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        // the arg is block size so add 1
        store.delete_block_index(blocks[3].index + 1, blocks[3].blockNumber, *transaction);
        store.delete_block_index(blocks[2].index + 1, blocks[2].blockNumber, *transaction);
        transaction->commit();
    }

    {
        // check the blocks again
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        block_number_t readBack = 0;
        EXPECT_TRUE(store.find_block_for_index(5, readBack, *transaction));
        EXPECT_EQ(readBack, 1);

        EXPECT_TRUE(store.find_block_for_index(30, readBack, *transaction));
        EXPECT_EQ(readBack, 2);

        EXPECT_FALSE(store.find_block_for_index(82, readBack, *transaction));

        EXPECT_FALSE(store.find_block_for_index(83, readBack, *transaction));

        EXPECT_FALSE(store.find_block_for_index(130, readBack, *transaction));

        EXPECT_FALSE(store.find_block_for_index(131, readBack, *transaction));
    }

    {
        // delete non-exisatent indices to check it does nothing
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        // the arg is block size so add 1
        store.delete_block_index(blocks[3].index + 1, blocks[3].blockNumber, *transaction);
        store.delete_block_index(blocks[2].index + 1, blocks[2].blockNumber, *transaction);
        store.delete_block_index(21, 1, *transaction);
        store.delete_block_index(150, 6, *transaction);
        transaction->commit();
    }

    {
        // check the blocks again
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        block_number_t readBack = 0;
        EXPECT_TRUE(store.find_block_for_index(5, readBack, *transaction));
        EXPECT_EQ(readBack, 1);

        EXPECT_TRUE(store.find_block_for_index(30, readBack, *transaction));
        EXPECT_EQ(readBack, 2);

        EXPECT_FALSE(store.find_block_for_index(82, readBack, *transaction));

        EXPECT_FALSE(store.find_block_for_index(83, readBack, *transaction));

        EXPECT_FALSE(store.find_block_for_index(130, readBack, *transaction));

        EXPECT_FALSE(store.find_block_for_index(131, readBack, *transaction));
    }
}

TEST_F(LMDBTreeStoreTest, can_write_and_retrieve_block_numbers_with_duplicate_indices)
{
    struct BlockAndIndex {
        block_number_t blockNumber;
        index_t index;
    };

    std::vector<BlockAndIndex> blocks{ BlockAndIndex{ .blockNumber = 1, .index = 25 },
                                       BlockAndIndex{ .blockNumber = 2, .index = 60 },
                                       BlockAndIndex{ .blockNumber = 3, .index = 60 },
                                       BlockAndIndex{ .blockNumber = 4, .index = 60 },
                                       BlockAndIndex{ .blockNumber = 5, .index = 130 } };
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    {
        // write all of the blocks. we will write them in reverse order
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        for (auto block : blocks) {
            // the arg is block size so add 1
            store.write_block_index_data(block.blockNumber, block.index + 1, *transaction);
        }
        transaction->commit();
    }

    {
        // we can't add a duplicate block at an index if it is not the next block number
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        // the arg is block size so add 1
        EXPECT_THROW(store.write_block_index_data(3, 60 + 1, *transaction), std::runtime_error);
        EXPECT_THROW(store.write_block_index_data(6, 60 + 1, *transaction), std::runtime_error);
        EXPECT_THROW(store.write_block_index_data(1, 25 + 1, *transaction), std::runtime_error);
        EXPECT_THROW(store.write_block_index_data(3, 25 + 1, *transaction), std::runtime_error);
        transaction->abort();
    }

    {
        // read back some blocks and check them
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        block_number_t readBack = 0;
        EXPECT_TRUE(store.find_block_for_index(5, readBack, *transaction));
        EXPECT_EQ(readBack, 1);

        // should be the lowest block at this index
        EXPECT_TRUE(store.find_block_for_index(30, readBack, *transaction));
        EXPECT_EQ(readBack, 2);

        EXPECT_TRUE(store.find_block_for_index(82, readBack, *transaction));
        EXPECT_EQ(readBack, 5);

        EXPECT_FALSE(store.find_block_for_index(131, readBack, *transaction));
    }

    {
        // attempting to delete block 2 at index 60 should fail as it is not the last block in the series at index 60
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        // the arg is block size so add 1
        EXPECT_THROW(store.delete_block_index(blocks[1].index + 1, blocks[1].blockNumber, *transaction),
                     std::runtime_error);
        transaction->abort();
    }

    {
        // read back some blocks and check them
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        block_number_t readBack = 0;
        EXPECT_TRUE(store.find_block_for_index(5, readBack, *transaction));
        EXPECT_EQ(readBack, 1);

        // should still be the lowest block at this index
        EXPECT_TRUE(store.find_block_for_index(30, readBack, *transaction));
        EXPECT_EQ(readBack, 2);

        EXPECT_TRUE(store.find_block_for_index(82, readBack, *transaction));
        EXPECT_EQ(readBack, 5);

        EXPECT_FALSE(store.find_block_for_index(131, readBack, *transaction));
    }

    {
        // try and delete blocks that don't exist at index 60
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        // the arg is block size so add 1
        EXPECT_THROW(store.delete_block_index(blocks[1].index + 1, 2, *transaction), std::runtime_error);
        EXPECT_THROW(store.delete_block_index(blocks[1].index + 1, 5, *transaction), std::runtime_error);
        transaction->abort();
    }

    {
        // read back some blocks and check them
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        block_number_t readBack = 0;
        EXPECT_TRUE(store.find_block_for_index(5, readBack, *transaction));
        EXPECT_EQ(readBack, 1);

        EXPECT_TRUE(store.find_block_for_index(30, readBack, *transaction));
        EXPECT_EQ(readBack, 2);

        EXPECT_TRUE(store.find_block_for_index(82, readBack, *transaction));
        EXPECT_EQ(readBack, 5);

        EXPECT_FALSE(store.find_block_for_index(131, readBack, *transaction));
    }

    {
        // delete the last 2 blocks at index 60
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        // the arg is block size so add 1
        store.delete_block_index(blocks[3].index + 1, blocks[3].blockNumber, *transaction);
        store.delete_block_index(blocks[2].index + 1, blocks[2].blockNumber, *transaction);
        transaction->commit();
    }

    {
        // check the blocks again
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        block_number_t readBack = 0;
        EXPECT_TRUE(store.find_block_for_index(5, readBack, *transaction));
        EXPECT_EQ(readBack, 1);

        EXPECT_TRUE(store.find_block_for_index(30, readBack, *transaction));
        EXPECT_EQ(readBack, 2);

        EXPECT_TRUE(store.find_block_for_index(82, readBack, *transaction));
        EXPECT_EQ(readBack, 5);
    }

    {
        // delete the last final block at index 60
        LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
        // the arg is block size so add 1
        // Only one block remains at index 60, try and delete one that doesn't exist, it should do nothing
        store.delete_block_index(blocks[3].index + 1, blocks[3].blockNumber, *transaction);

        // Now delete the last block
        store.delete_block_index(blocks[1].index + 1, blocks[1].blockNumber, *transaction);
        transaction->commit();
    }

    {
        // check the blocks again
        LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
        block_number_t readBack = 0;
        EXPECT_TRUE(store.find_block_for_index(5, readBack, *transaction));
        EXPECT_EQ(readBack, 1);

        EXPECT_TRUE(store.find_block_for_index(30, readBack, *transaction));
        EXPECT_EQ(readBack, 5);

        EXPECT_TRUE(store.find_block_for_index(82, readBack, *transaction));
        EXPECT_EQ(readBack, 5);
    }
}

TEST_F(LMDBTreeStoreTest, reports_physical_file_size)
{
    LMDBTreeStore store(_directory, "DB1", _mapSize, _maxReaders);
    std::string dataDbPath = (std::filesystem::path(_directory) / "data.mdb").string();
    size_t previousFileSize = 0;

    for (size_t i = 0; i < 3; i++) {
        {
            BlockPayload blockData;
            blockData.blockNumber = static_cast<block_number_t>(i);
            blockData.root = VALUES[i];
            blockData.size = 45 + (i * 97);

            TreeMeta metaData;
            metaData.committedSize = blockData.size;
            metaData.size = blockData.size;
            metaData.root = blockData.root;
            metaData.depth = 32;
            metaData.unfinalisedBlockHeight = static_cast<block_number_t>(i);
            metaData.name = "NullifierTree";

            // Write metadata and block data with different values each iteration
            LMDBWriteTransaction::Ptr transaction = store.create_write_transaction();
            store.write_meta_data(metaData, *transaction);
            store.write_block_data(blockData.blockNumber, blockData, *transaction);
            transaction->commit();
        }

        {
            LMDBReadTransaction::Ptr transaction = store.create_read_transaction();
            TreeDBStats stats;
            store.get_stats(stats, *transaction);

            EXPECT_TRUE(std::filesystem::exists(dataDbPath));

            // Verify reported size matches actual file size
            EXPECT_EQ(stats.physicalFileSize, std::filesystem::file_size(dataDbPath));

            // Verify size is increasing due to the new DB writes
            EXPECT_GT(stats.physicalFileSize, previousFileSize);

            previousFileSize = stats.physicalFileSize;
        }
    }
}
