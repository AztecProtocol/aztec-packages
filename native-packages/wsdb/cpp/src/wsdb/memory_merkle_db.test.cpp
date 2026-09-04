#include "common/aztec_constants.hpp"
#include "field/field_element.hpp"
#include "merkle_tree/fixtures.hpp"
#include "merkle_tree/indexed_leaf.hpp"
#include "merkle_tree/response.hpp"
#include "world_state/types.hpp"
#include "world_state/world_state.hpp"
#include "wsdb/reference_merkle_db.hpp"
#include <cstdint>
#include <filesystem>
#include <gtest/gtest.h>
#include <string>
#include <unordered_map>
#include <vector>

// This test is the conformance gate for this package's WorldState against barretenberg's
// in-memory reference world state (world_state_reference), reached through its flat C ABI
// (see reference_merkle_db.hpp) so no barretenberg headers are compiled here. The reference
// is the spec for the AVM-facing tree semantics: both sides are driven through an identical
// sequence of operations and must agree, after every step, on roots, sibling paths, low-leaf
// lookups and indexed-leaf preimages. Any divergence here is a conformance bug in this
// package (or a spec change in the reference that this package has not caught up with).

using namespace azteclabs::wsdb::world_state;
using namespace azteclabs::wsdb::merkle_tree;
using azteclabs::wsdb::fr;
using azteclabs::wsdb::ReferenceMerkleDB;

namespace {

constexpr size_t NULLIFIER_PREFILL = 128;
constexpr size_t PUBLIC_DATA_PREFILL = 128;

class ReferenceConformanceTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        data_dir = random_temp_directory();
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
                                          /*map_size=*/10240,
                                          tree_heights,
                                          tree_prefill,
                                          DOM_SEP__BLOCK_HEADER_HASH);

        ref = std::make_unique<ReferenceMerkleDB>(NULLIFIER_PREFILL, PUBLIC_DATA_PREFILL);
    }

    void TearDown() override
    {
        ws.reset();
        std::filesystem::remove_all(data_dir);
    }

    static WorldStateRevision revision() { return WorldStateRevision::uncommitted(); }

    void expect_roots_equal()
    {
        for (MerkleTreeId tree_id : { MerkleTreeId::NULLIFIER_TREE,
                                      MerkleTreeId::NOTE_HASH_TREE,
                                      MerkleTreeId::PUBLIC_DATA_TREE,
                                      MerkleTreeId::L1_TO_L2_MESSAGE_TREE }) {
            const auto snapshot = ref->get_snapshot(tree_id);
            const auto info = ws->get_tree_info(revision(), tree_id);
            EXPECT_EQ(snapshot.root, info.meta.root) << "root mismatch for tree " << static_cast<int>(tree_id);
            EXPECT_EQ(snapshot.next_available_leaf_index, info.meta.size)
                << "size mismatch for tree " << static_cast<int>(tree_id);
        }
    }

    void expect_sibling_path_equal(MerkleTreeId tree_id, index_t leaf_index)
    {
        EXPECT_EQ(ref->get_sibling_path(tree_id, leaf_index), ws->get_sibling_path(revision(), tree_id, leaf_index))
            << "sibling path mismatch, tree " << static_cast<int>(tree_id) << " index " << leaf_index;
    }

    void expect_leaf_value_equal(MerkleTreeId tree_id, index_t leaf_index)
    {
        auto ws_leaf = ws->get_leaf<fr>(revision(), tree_id, leaf_index);
        ASSERT_TRUE(ws_leaf.has_value());
        EXPECT_EQ(ref->get_leaf_value(tree_id, leaf_index), ws_leaf.value())
            << "leaf value mismatch, tree " << static_cast<int>(tree_id) << " index " << leaf_index;
    }

    void expect_low_leaf_equal(MerkleTreeId tree_id, const fr& key)
    {
        EXPECT_EQ(ref->get_low_indexed_leaf(tree_id, key), ws->find_low_leaf_index(revision(), tree_id, key));
    }

    void expect_nullifier_preimage_equal(index_t leaf_index)
    {
        auto ws_leaf = ws->get_indexed_leaf<NullifierLeafValue>(revision(), MerkleTreeId::NULLIFIER_TREE, leaf_index);
        ASSERT_TRUE(ws_leaf.has_value());
        EXPECT_EQ(ref->get_nullifier_preimage(leaf_index), ws_leaf.value())
            << "nullifier preimage mismatch at index " << leaf_index;
    }

    void expect_public_data_preimage_equal(index_t leaf_index)
    {
        auto ws_leaf =
            ws->get_indexed_leaf<PublicDataLeafValue>(revision(), MerkleTreeId::PUBLIC_DATA_TREE, leaf_index);
        ASSERT_TRUE(ws_leaf.has_value());
        EXPECT_EQ(ref->get_public_data_preimage(leaf_index), ws_leaf.value())
            << "public data preimage mismatch at index " << leaf_index;
    }

    std::string data_dir;
    std::unique_ptr<WorldState> ws;
    std::unique_ptr<ReferenceMerkleDB> ref;
};

// Genesis state must already match: the indexed trees are prefilled with an ascending linked chain of
// padding leaves, the append-only trees start empty.
TEST_F(ReferenceConformanceTest, GenesisMatches)
{
    expect_roots_equal();

    // Indexed-tree genesis preimages and sibling paths. (get_leaf_value is only ever called on the
    // append-only trees in production, so we don't cross-check leaf values for the indexed trees.)
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
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, fr(1));
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, fr(127));
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, fr(500));
    expect_low_leaf_equal(MerkleTreeId::PUBLIC_DATA_TREE, fr(42));
    expect_low_leaf_equal(MerkleTreeId::PUBLIC_DATA_TREE, fr(5000));
}

TEST_F(ReferenceConformanceTest, AppendNoteHashes)
{
    std::vector<fr> note_hashes{ fr(111), fr(222), fr(333) };
    ws->append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, note_hashes);
    ref->append_leaves(MerkleTreeId::NOTE_HASH_TREE, note_hashes);

    expect_roots_equal();
    for (index_t i = 0; i < 4; ++i) {
        expect_sibling_path_equal(MerkleTreeId::NOTE_HASH_TREE, i);
    }
    for (index_t i = 0; i < 3; ++i) {
        expect_leaf_value_equal(MerkleTreeId::NOTE_HASH_TREE, i);
    }

    // Append to L1->L2 as well.
    std::vector<fr> msgs{ fr(7), fr(8) };
    ws->append_leaves<fr>(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, msgs);
    ref->append_leaves(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, msgs);
    expect_roots_equal();
    expect_sibling_path_equal(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 0);
    expect_sibling_path_equal(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 1);
    expect_leaf_value_equal(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 0);
}

TEST_F(ReferenceConformanceTest, PadNoteHashTree)
{
    std::vector<fr> note_hashes{ fr(111), fr(222), fr(333) };
    ws->append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, note_hashes);
    ref->append_leaves(MerkleTreeId::NOTE_HASH_TREE, note_hashes);

    // The AVM pads the note-hash tree to a multiple of MAX_NOTE_HASHES_PER_TX; on the world state that
    // is an append of zero leaves, on the reference a pad_tree.
    size_t padding = MAX_NOTE_HASHES_PER_TX - (note_hashes.size() % MAX_NOTE_HASHES_PER_TX);
    ws->append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, std::vector<fr>(padding, fr(0)));
    ref->pad_tree(MerkleTreeId::NOTE_HASH_TREE, padding);

    expect_roots_equal();
    expect_sibling_path_equal(MerkleTreeId::NOTE_HASH_TREE, 2);
    expect_sibling_path_equal(MerkleTreeId::NOTE_HASH_TREE, padding + 2);
}

TEST_F(ReferenceConformanceTest, InsertNullifiers)
{
    // Keys must exceed the genesis padding range [0, 128) so each is a genuine insertion; nullifiers
    // are not updateable, so re-inserting an existing key would (faithfully) throw on both sides.
    for (const fr& nullifier : { fr(1000), fr(500), fr(1000000), fr(750) }) {
        // The world state's low-leaf witness captures the pre-insertion state; check the reference
        // agrees on it before mutating.
        const auto low = ref->get_low_indexed_leaf(MerkleTreeId::NULLIFIER_TREE, nullifier);
        const index_t new_index = ref->get_snapshot(MerkleTreeId::NULLIFIER_TREE).next_available_leaf_index;

        auto ws_result = ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { { nullifier } });
        ref->insert_nullifier(nullifier);

        ASSERT_FALSE(ws_result.low_leaf_witness_data.empty());
        EXPECT_EQ(low.index, ws_result.low_leaf_witness_data[0].index);
        ASSERT_FALSE(ws_result.insertion_witness_data.empty());
        EXPECT_EQ(new_index, ws_result.insertion_witness_data[0].index);

        expect_roots_equal();
        // The newly inserted leaf and the (mutated) low leaf.
        expect_nullifier_preimage_equal(new_index);
        expect_nullifier_preimage_equal(low.index);
        expect_sibling_path_equal(MerkleTreeId::NULLIFIER_TREE, new_index);
    }

    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, fr(500));
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, fr(600));
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, fr(1000));
}

TEST_F(ReferenceConformanceTest, InsertAndUpdatePublicData)
{
    // First insertion of a fresh slot.
    const index_t new_index = ref->get_snapshot(MerkleTreeId::PUBLIC_DATA_TREE).next_available_leaf_index;
    ws->insert_indexed_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, { { fr(900), fr(11) } });
    ref->insert_public_data(fr(900), fr(11));
    expect_roots_equal();
    expect_public_data_preimage_equal(new_index);
    expect_sibling_path_equal(MerkleTreeId::PUBLIC_DATA_TREE, new_index);

    // Update of the same slot (public-data leaves are updateable; this goes through the "already present"
    // branch and mutates the existing leaf in place rather than appending).
    ws->insert_indexed_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, { { fr(900), fr(99) } });
    ref->insert_public_data(fr(900), fr(99));
    expect_roots_equal();
    expect_public_data_preimage_equal(new_index);
    expect_low_leaf_equal(MerkleTreeId::PUBLIC_DATA_TREE, fr(900));
}

// Exercises the full checkpoint protocol (create / commit / revert) and confirms the reference tracks
// roots in lockstep with the world state across nested checkpoints.
TEST_F(ReferenceConformanceTest, Checkpoints)
{
    EXPECT_EQ(ref->get_checkpoint_id(), 0u);

    // Outer checkpoint, then a mutation.
    ws->checkpoint(CANONICAL_FORK_ID);
    ref->create_checkpoint();
    EXPECT_EQ(ref->get_checkpoint_id(), 1u);

    ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { { fr(4242) } });
    ref->insert_nullifier(fr(4242));
    expect_roots_equal();

    // Nested checkpoint, mutate, then revert it: state returns to the post-insert snapshot.
    ws->checkpoint(CANONICAL_FORK_ID);
    ref->create_checkpoint();
    EXPECT_EQ(ref->get_checkpoint_id(), 2u);

    ws->append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, std::vector<fr>{ fr(7) });
    ref->append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<fr>{ fr(7) });
    expect_roots_equal();

    ws->revert_checkpoint(CANONICAL_FORK_ID);
    ref->revert_checkpoint();
    EXPECT_EQ(ref->get_checkpoint_id(), 1u);
    expect_roots_equal();
    // The note-hash append was rolled back.
    EXPECT_EQ(ref->get_snapshot(MerkleTreeId::NOTE_HASH_TREE).next_available_leaf_index, 0u);

    // Commit the outer checkpoint: the nullifier insertion is kept.
    ws->commit_checkpoint(CANONICAL_FORK_ID);
    ref->commit_checkpoint();
    EXPECT_EQ(ref->get_checkpoint_id(), 0u);
    expect_roots_equal();
    expect_low_leaf_equal(MerkleTreeId::NULLIFIER_TREE, fr(4242));
}

// A combined sequence mirroring the AVM fuzzer's genesis seeding, asserting equality at every step.
TEST_F(ReferenceConformanceTest, MixedSequence)
{
    // Register-contract-style nullifier inserts.
    for (const fr& nullifier : { fr(0x1111), fr(0x2222) }) {
        ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { { nullifier } });
        ref->insert_nullifier(nullifier);
        expect_roots_equal();
    }

    // Fee-payer / public-data writes.
    ws->insert_indexed_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, { { fr(0xABCD), fr(123456) } });
    ref->insert_public_data(fr(0xABCD), fr(123456));
    expect_roots_equal();

    // Note hashes + padding.
    std::vector<fr> note_hashes{ fr(1), fr(2) };
    size_t padding = MAX_NOTE_HASHES_PER_TX - (note_hashes.size() % MAX_NOTE_HASHES_PER_TX);
    ws->append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, note_hashes);
    ws->append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, std::vector<fr>(padding, fr(0)));
    ref->append_leaves(MerkleTreeId::NOTE_HASH_TREE, note_hashes);
    ref->pad_tree(MerkleTreeId::NOTE_HASH_TREE, padding);
    expect_roots_equal();

    expect_sibling_path_equal(MerkleTreeId::NULLIFIER_TREE, NULLIFIER_PREFILL);
    expect_sibling_path_equal(MerkleTreeId::PUBLIC_DATA_TREE, PUBLIC_DATA_PREFILL);
    expect_sibling_path_equal(MerkleTreeId::NOTE_HASH_TREE, 0);
    expect_nullifier_preimage_equal(NULLIFIER_PREFILL);
    expect_public_data_preimage_equal(PUBLIC_DATA_PREFILL);
}

} // namespace
