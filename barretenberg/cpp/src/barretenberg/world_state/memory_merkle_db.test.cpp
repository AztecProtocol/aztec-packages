#include "barretenberg/world_state_reference/memory_merkle_db.hpp"

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

#include <gtest/gtest.h>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/world_state/world_state.hpp"

// This test is the canonical-fidelity gate for MemoryMerkleDB. It drives an ephemeral, file-backed
// world_state::WorldState and an in-memory MemoryMerkleDB through an identical sequence of operations
// (the same genesis the AVM fuzzer uses) and asserts, after every step, that the two agree on roots,
// sibling paths, low-leaf lookups, indexed-leaf preimages and leaf values. WorldState is the source of
// truth for the AVM trees; MemoryMerkleDB exists to reproduce it in memory for the differential fuzzer,
// so any divergence here is a MemoryMerkleDB bug.

namespace bb::world_state {
namespace {

using crypto::merkle_tree::IndexedLeaf;
using crypto::merkle_tree::NullifierLeafValue;
using crypto::merkle_tree::PublicDataLeafValue;

constexpr size_t NULLIFIER_PREFILL = 128;
constexpr size_t PUBLIC_DATA_PREFILL = 128;

class MemoryMerkleDBEquivalenceTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        data_dir = crypto::merkle_tree::random_temp_directory();
        std::filesystem::create_directories(data_dir);

        std::unordered_map<MerkleTreeId, uint32_t> tree_heights{
            { MerkleTreeId::NULLIFIER_TREE, NULLIFIER_TREE_HEIGHT },
            { MerkleTreeId::NOTE_HASH_TREE, NOTE_HASH_TREE_HEIGHT },
            { MerkleTreeId::PUBLIC_DATA_TREE, PUBLIC_DATA_TREE_HEIGHT },
            { MerkleTreeId::L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_TREE_HEIGHT },
            { MerkleTreeId::ARCHIVE, ARCHIVE_HEIGHT },
        };
        std::unordered_map<MerkleTreeId, index_t> tree_prefill{
            { MerkleTreeId::NULLIFIER_TREE, NULLIFIER_PREFILL },
            { MerkleTreeId::PUBLIC_DATA_TREE, PUBLIC_DATA_PREFILL },
        };

        ws = std::make_unique<WorldState>(/*thread_pool_size=*/1,
                                          data_dir,
                                          /*map_size=*/static_cast<uint64_t>(1024) * 1024,
                                          tree_heights,
                                          tree_prefill,
                                          /*initial_header_generator_point=*/DOM_SEP__BLOCK_HEADER_HASH);

        mem = std::make_unique<MemoryMerkleDB>(NULLIFIER_PREFILL, PUBLIC_DATA_PREFILL);
    }

    void TearDown() override
    {
        ws.reset();
        std::filesystem::remove_all(data_dir);
    }

    static WorldStateRevision revision() { return WorldStateRevision::uncommitted(); }

    // Asserts the two databases agree on the structural snapshot (root + size) of every tree.
    void expect_roots_equal()
    {
        const TreeRoots mem_snap = mem->get_tree_roots();
        check_snapshot(MerkleTreeId::NULLIFIER_TREE, mem_snap.nullifier_tree);
        check_snapshot(MerkleTreeId::PUBLIC_DATA_TREE, mem_snap.public_data_tree);
        check_snapshot(MerkleTreeId::NOTE_HASH_TREE, mem_snap.note_hash_tree);
        check_snapshot(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, mem_snap.l1_to_l2_message_tree);
    }

    void check_snapshot(MerkleTreeId tree_id, const TreeSnapshot& mem_snap)
    {
        auto info = ws->get_tree_info(revision(), tree_id);
        EXPECT_EQ(mem_snap.root, info.meta.root) << "root mismatch for tree " << static_cast<int>(tree_id);
        EXPECT_EQ(mem_snap.next_available_leaf_index, info.meta.size)
            << "size mismatch for tree " << static_cast<int>(tree_id);
    }

    void expect_sibling_path_equal(MerkleTreeId tree_id, index_t leaf_index)
    {
        EXPECT_EQ(mem->get_sibling_path(tree_id, leaf_index), ws->get_sibling_path(revision(), tree_id, leaf_index))
            << "sibling path mismatch for tree " << static_cast<int>(tree_id) << " index " << leaf_index;
    }

    void expect_leaf_value_equal(MerkleTreeId tree_id, index_t leaf_index)
    {
        auto ws_leaf = ws->get_leaf<FF>(revision(), tree_id, leaf_index);
        ASSERT_TRUE(ws_leaf.has_value()) << "world state has no leaf for tree " << static_cast<int>(tree_id)
                                         << " index " << leaf_index;
        EXPECT_EQ(mem->get_leaf_value(tree_id, leaf_index), ws_leaf.value())
            << "leaf value mismatch for tree " << static_cast<int>(tree_id) << " index " << leaf_index;
    }

    void expect_low_leaf_equal(MerkleTreeId tree_id, const FF& key)
    {
        EXPECT_EQ(mem->get_low_indexed_leaf(tree_id, key), ws->find_low_leaf_index(revision(), tree_id, key))
            << "low leaf mismatch for tree " << static_cast<int>(tree_id) << " key " << key;
    }

    void expect_nullifier_preimage_equal(index_t leaf_index)
    {
        auto ws_leaf = ws->get_indexed_leaf<NullifierLeafValue>(revision(), MerkleTreeId::NULLIFIER_TREE, leaf_index);
        ASSERT_TRUE(ws_leaf.has_value()) << "world state has no nullifier leaf at index " << leaf_index;
        EXPECT_EQ(mem->get_leaf_preimage_nullifier_tree(leaf_index), ws_leaf.value())
            << "nullifier preimage mismatch at index " << leaf_index;
    }

    void expect_public_data_preimage_equal(index_t leaf_index)
    {
        auto ws_leaf =
            ws->get_indexed_leaf<PublicDataLeafValue>(revision(), MerkleTreeId::PUBLIC_DATA_TREE, leaf_index);
        ASSERT_TRUE(ws_leaf.has_value()) << "world state has no public data leaf at index " << leaf_index;
        EXPECT_EQ(mem->get_leaf_preimage_public_data_tree(leaf_index), ws_leaf.value())
            << "public data preimage mismatch at index " << leaf_index;
    }

    std::string data_dir;
    std::unique_ptr<WorldState> ws;
    std::unique_ptr<MemoryMerkleDB> mem;
};

// Genesis state must already match: the indexed trees are prefilled with an ascending linked chain of
// padding leaves, the append-only trees start empty.
TEST_F(MemoryMerkleDBEquivalenceTest, GenesisMatches)
{
    expect_roots_equal();

    // Indexed-tree genesis preimages and sibling paths. (get_leaf_value is only ever called on the
    // append-only trees in production; WorldState's get_leaf<FF> is not valid for indexed trees, so we
    // don't cross-check leaf values for them.)
    for (index_t i : { index_t(0), index_t(1), index_t(63), index_t(127) }) {
        expect_nullifier_preimage_equal(i);
        expect_public_data_preimage_equal(i);
        expect_sibling_path_equal(MerkleTreeId::NULLIFIER_TREE, i);
        expect_sibling_path_equal(MerkleTreeId::PUBLIC_DATA_TREE, i);
    }

    // Append-only genesis (empty trees) sibling paths.
    expect_sibling_path_equal(MerkleTreeId::NOTE_HASH_TREE, 0);
    expect_sibling_path_equal(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 0);

    // Low-leaf lookups over the genesis chain (present and absent keys).
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, FF(1));
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, FF(127));
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, FF(500));
    expect_low_leaf_equal(MerkleTreeId::PUBLIC_DATA_TREE, FF(42));
    expect_low_leaf_equal(MerkleTreeId::PUBLIC_DATA_TREE, FF(5000));
}

TEST_F(MemoryMerkleDBEquivalenceTest, AppendNoteHashes)
{
    std::vector<FF> note_hashes{ FF(111), FF(222), FF(333) };
    ws->append_leaves<FF>(MerkleTreeId::NOTE_HASH_TREE, note_hashes);
    mem->append_leaves(MerkleTreeId::NOTE_HASH_TREE, note_hashes);

    expect_roots_equal();
    for (index_t i = 0; i < 4; ++i) {
        expect_sibling_path_equal(MerkleTreeId::NOTE_HASH_TREE, i);
    }
    for (index_t i = 0; i < 3; ++i) {
        expect_leaf_value_equal(MerkleTreeId::NOTE_HASH_TREE, i);
    }

    // Append to L1->L2 as well.
    std::vector<FF> msgs{ FF(7), FF(8) };
    ws->append_leaves<FF>(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, msgs);
    mem->append_leaves(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, msgs);
    expect_roots_equal();
    expect_sibling_path_equal(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 0);
    expect_sibling_path_equal(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 1);
    expect_leaf_value_equal(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 0);
}

TEST_F(MemoryMerkleDBEquivalenceTest, PadNoteHashTree)
{
    std::vector<FF> note_hashes{ FF(111), FF(222), FF(333) };
    ws->append_leaves<FF>(MerkleTreeId::NOTE_HASH_TREE, note_hashes);
    mem->append_leaves(MerkleTreeId::NOTE_HASH_TREE, note_hashes);

    // PureRawMerkleDB pads the note-hash tree by appending zero leaves.
    size_t padding = MAX_NOTE_HASHES_PER_TX - (note_hashes.size() % MAX_NOTE_HASHES_PER_TX);
    ws->append_leaves<FF>(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>(padding, FF(0)));
    mem->pad_tree(MerkleTreeId::NOTE_HASH_TREE, padding);

    expect_roots_equal();
    expect_sibling_path_equal(MerkleTreeId::NOTE_HASH_TREE, 2);
    expect_sibling_path_equal(MerkleTreeId::NOTE_HASH_TREE, padding + 2);
}

TEST_F(MemoryMerkleDBEquivalenceTest, InsertNullifiers)
{
    // Keys must exceed the genesis padding range [0, 128) so each is a genuine insertion; nullifiers
    // are not updateable, so re-inserting an existing key would (faithfully) throw.
    for (const FF& nullifier : { FF(1000), FF(500), FF(1000000), FF(750) }) {
        NullifierLeafValue leaf(nullifier);

        auto mem_result = mem->insert_indexed_leaves_nullifier_tree(leaf);
        auto ws_result = ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { leaf });

        EXPECT_EQ(mem_result.low_leaf_witness_data.size(), ws_result.low_leaf_witness_data.size());
        ASSERT_FALSE(ws_result.low_leaf_witness_data.empty());
        EXPECT_EQ(mem_result.low_leaf_witness_data[0].leaf, ws_result.low_leaf_witness_data[0].leaf);
        EXPECT_EQ(mem_result.low_leaf_witness_data[0].index, ws_result.low_leaf_witness_data[0].index);
        EXPECT_EQ(mem_result.low_leaf_witness_data[0].path, ws_result.low_leaf_witness_data[0].path);
        ASSERT_FALSE(ws_result.insertion_witness_data.empty());
        ASSERT_FALSE(mem_result.insertion_witness_data.empty());
        EXPECT_EQ(mem_result.insertion_witness_data[0].leaf, ws_result.insertion_witness_data[0].leaf);
        EXPECT_EQ(mem_result.insertion_witness_data[0].index, ws_result.insertion_witness_data[0].index);
        EXPECT_EQ(mem_result.insertion_witness_data[0].path, ws_result.insertion_witness_data[0].path);

        expect_roots_equal();
        // The newly inserted leaf and the (mutated) low leaf.
        index_t new_index = ws_result.insertion_witness_data[0].index;
        index_t low_index = ws_result.low_leaf_witness_data[0].index;
        expect_nullifier_preimage_equal(new_index);
        expect_nullifier_preimage_equal(low_index);
        expect_sibling_path_equal(MerkleTreeId::NULLIFIER_TREE, new_index);
    }

    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, FF(500));
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, FF(600));
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, FF(1000));
}

TEST_F(MemoryMerkleDBEquivalenceTest, InsertAndUpdatePublicData)
{
    // First insertion of a fresh slot.
    PublicDataLeafValue first(FF(900), FF(11));
    auto mem_r1 = mem->insert_indexed_leaves_public_data_tree(first);
    auto ws_r1 = ws->insert_indexed_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, { first });
    expect_roots_equal();
    index_t new_index = ws_r1.insertion_witness_data[0].index;
    expect_public_data_preimage_equal(new_index);
    expect_sibling_path_equal(MerkleTreeId::PUBLIC_DATA_TREE, new_index);

    // Update of the same slot (public-data leaves are updateable; this goes through the "already present"
    // branch and mutates the existing leaf in place rather than appending).
    PublicDataLeafValue update(FF(900), FF(99));
    auto mem_r2 = mem->insert_indexed_leaves_public_data_tree(update);
    auto ws_r2 = ws->insert_indexed_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, { update });
    EXPECT_EQ(mem_r2.low_leaf_witness_data[0].leaf, ws_r2.low_leaf_witness_data[0].leaf);
    EXPECT_EQ(mem_r2.low_leaf_witness_data[0].index, ws_r2.low_leaf_witness_data[0].index);
    expect_roots_equal();
    expect_public_data_preimage_equal(new_index);
    expect_low_leaf_equal(MerkleTreeId::PUBLIC_DATA_TREE, FF(900));
}

// Exercises the full checkpoint protocol (create / commit / revert) and confirms the in-memory DB tracks
// roots and checkpoint ids in lockstep with the world state across nested checkpoints.
TEST_F(MemoryMerkleDBEquivalenceTest, Checkpoints)
{
    EXPECT_EQ(mem->get_checkpoint_id(), 0u);

    // Outer checkpoint, then a mutation.
    ws->checkpoint(world_state::CANONICAL_FORK_ID);
    mem->create_checkpoint();
    EXPECT_EQ(mem->get_checkpoint_id(), 1u);

    NullifierLeafValue n1(FF(4242));
    ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { n1 });
    mem->insert_indexed_leaves_nullifier_tree(n1);
    expect_roots_equal();

    // Nested checkpoint, mutate, then revert it: state returns to the post-n1 snapshot.
    ws->checkpoint(world_state::CANONICAL_FORK_ID);
    mem->create_checkpoint();
    EXPECT_EQ(mem->get_checkpoint_id(), 2u);

    ws->append_leaves<FF>(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(7) });
    mem->append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(7) });
    expect_roots_equal();

    ws->revert_checkpoint(world_state::CANONICAL_FORK_ID);
    mem->revert_checkpoint();
    EXPECT_EQ(mem->get_checkpoint_id(), 1u);
    expect_roots_equal();
    // The note-hash append was rolled back.
    EXPECT_EQ(mem->get_tree_roots().note_hash_tree.next_available_leaf_index, 0u);

    // Commit the outer checkpoint: the n1 insertion is kept.
    ws->commit_checkpoint(world_state::CANONICAL_FORK_ID);
    mem->commit_checkpoint();
    EXPECT_EQ(mem->get_checkpoint_id(), 0u);
    expect_roots_equal();
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, FF(4242));
}

// A combined sequence mirroring a fuzzer transaction's genesis seeding, asserting equality at every step.
TEST_F(MemoryMerkleDBEquivalenceTest, MixedSequence)
{
    // Register-contract-style nullifier inserts.
    for (const FF& nullifier : { FF(0x1111), FF(0x2222) }) {
        NullifierLeafValue leaf(nullifier);
        ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { leaf });
        mem->insert_indexed_leaves_nullifier_tree(leaf);
        expect_roots_equal();
    }

    // Fee-payer / public-data writes.
    PublicDataLeafValue pd(FF(0xABCD), FF(123456));
    ws->insert_indexed_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, { pd });
    mem->insert_indexed_leaves_public_data_tree(pd);
    expect_roots_equal();

    // Note hashes + padding.
    std::vector<FF> note_hashes{ FF(1), FF(2) };
    size_t padding = MAX_NOTE_HASHES_PER_TX - (note_hashes.size() % MAX_NOTE_HASHES_PER_TX);
    ws->append_leaves<FF>(MerkleTreeId::NOTE_HASH_TREE, note_hashes);
    ws->append_leaves<FF>(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>(padding, FF(0)));
    mem->append_leaves(MerkleTreeId::NOTE_HASH_TREE, note_hashes);
    mem->pad_tree(MerkleTreeId::NOTE_HASH_TREE, padding);
    expect_roots_equal();

    expect_sibling_path_equal(MerkleTreeId::NULLIFIER_TREE, NULLIFIER_PREFILL);
    expect_sibling_path_equal(MerkleTreeId::PUBLIC_DATA_TREE, PUBLIC_DATA_PREFILL);
    expect_sibling_path_equal(MerkleTreeId::NOTE_HASH_TREE, 0);
    expect_nullifier_preimage_equal(NULLIFIER_PREFILL);
    expect_public_data_preimage_equal(PUBLIC_DATA_PREFILL);
}

} // namespace
} // namespace bb::world_state
