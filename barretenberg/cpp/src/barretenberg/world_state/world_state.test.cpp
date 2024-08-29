#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/world_state/types.hpp"
#include <filesystem>
#include <gtest/gtest.h>

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

class WorldStateTest : public testing::Test {
  protected:
    void SetUp() override
    {
        // setup with 1MB max db size, 1 max database and 2 maximum concurrent readers
        _directory = randomTempDirectory();
        std::filesystem::create_directories(_directory);
    }

    void TearDown() override { std::filesystem::remove_all(_directory); }

    static std::string _directory;
};

std::string WorldStateTest::_directory;

template <typename Leaf>
void assert_leaf_status(
    const WorldState& ws, WorldStateRevision revision, MerkleTreeId tree_id, index_t leaf_index, bool exists)
{
    std::optional<Leaf> leaf = ws.get_leaf<Leaf>(revision, tree_id, leaf_index);
    EXPECT_EQ(leaf.has_value(), exists);
}

template <typename Leaf>
void assert_leaf_value(const WorldState& ws,
                       WorldStateRevision revision,
                       MerkleTreeId tree_id,
                       index_t leaf_index,
                       const Leaf& expected_value)
{
    std::optional<Leaf> leaf = ws.get_leaf<Leaf>(revision, tree_id, leaf_index);
    EXPECT_EQ(leaf.has_value(), true);
    EXPECT_EQ(leaf.value(), expected_value);
}

template <typename Leaf>
void assert_leaf_exists(
    const WorldState& ws, WorldStateRevision revision, MerkleTreeId tree_id, const Leaf& expected_value, bool exists)
{
    std::optional<index_t> index = ws.find_leaf_index(revision, tree_id, expected_value);
    EXPECT_EQ(index.has_value(), exists);
}

template <typename Leaf>
void assert_leaf_index(
    const WorldState& ws, WorldStateRevision revision, MerkleTreeId tree_id, const Leaf& value, index_t expected_index)
{
    std::optional<index_t> index = ws.find_leaf_index<Leaf>(revision, tree_id, value);
    EXPECT_EQ(index.value(), expected_index);
}

void assert_tree_size(const WorldState& ws, WorldStateRevision revision, MerkleTreeId tree_id, size_t expected_size)
{
    auto info = ws.get_tree_info(revision, tree_id);
    EXPECT_EQ(info.size, expected_size);
}

void assert_sibling_path(
    const WorldState& ws, WorldStateRevision revision, MerkleTreeId tree_id, fr root, fr leaf, index_t index)
{
    auto sibling_path = ws.get_sibling_path(revision, tree_id, index);
    fr left;
    fr right;
    fr hash = leaf;
    for (const auto& node : sibling_path) {
        if (index % 2 == 0) {
            left = hash;
            right = node;
        } else {
            left = node;
            right = hash;
        }

        hash = HashPolicy::hash_pair(left, right);
        index >>= 1;
    }

    EXPECT_EQ(hash, root);
}

TEST_F(WorldStateTest, GetInitialTreeInfoForAllTrees)
{
    WorldState ws(1, _directory, 1024);

    {
        auto info = ws.get_tree_info(WorldStateRevision::committed(), MerkleTreeId::NULLIFIER_TREE);
        EXPECT_EQ(info.size, 128);
        EXPECT_EQ(info.depth, NULLIFIER_TREE_HEIGHT);
        EXPECT_EQ(info.root, bb::fr("0x0bcfa3e9f1a8922ee92c6dc964d6595907c1804a86753774322b468f69d4f278"));
    }

    {
        auto info = ws.get_tree_info(WorldStateRevision::committed(), MerkleTreeId::NOTE_HASH_TREE);
        EXPECT_EQ(info.size, 0);
        EXPECT_EQ(info.depth, NOTE_HASH_TREE_HEIGHT);
        EXPECT_EQ(info.root, bb::fr("0x16642d9ccd8346c403aa4c3fa451178b22534a27035cdaa6ec34ae53b29c50cb"));
    }

    {
        auto info = ws.get_tree_info(WorldStateRevision::committed(), MerkleTreeId::PUBLIC_DATA_TREE);
        EXPECT_EQ(info.size, 128);
        EXPECT_EQ(info.depth, PUBLIC_DATA_TREE_HEIGHT);
        EXPECT_EQ(info.root, bb::fr("0x021a6cc64c830b4914600d0296c3968c5d28c1b00c5c4b0b33d1f39d948edbd4"));
    }

    {
        auto info = ws.get_tree_info(WorldStateRevision::committed(), MerkleTreeId::L1_TO_L2_MESSAGE_TREE);
        EXPECT_EQ(info.size, 0);
        EXPECT_EQ(info.depth, L1_TO_L2_MSG_TREE_HEIGHT);
        EXPECT_EQ(info.root, bb::fr("0x1864fcdaa80ff2719154fa7c8a9050662972707168d69eac9db6fd3110829f80"));
    }

    {
        auto info = ws.get_tree_info(WorldStateRevision::committed(), MerkleTreeId::ARCHIVE);
        EXPECT_EQ(info.size, 0);
        EXPECT_EQ(info.depth, ARCHIVE_TREE_HEIGHT);
        EXPECT_EQ(info.root, bb::fr("0x1864fcdaa80ff2719154fa7c8a9050662972707168d69eac9db6fd3110829f80"));
    }
}

TEST_F(WorldStateTest, GetInitialStateReference)
{
    WorldState ws(1, _directory, 1024);
    auto state_ref = ws.get_state_reference(WorldStateRevision::committed());

    EXPECT_EQ(state_ref.size(), 5);

    {
        auto snapshot = state_ref.at(MerkleTreeId::NULLIFIER_TREE);
        EXPECT_EQ(snapshot,
                  std::make_pair(bb::fr("0x0bcfa3e9f1a8922ee92c6dc964d6595907c1804a86753774322b468f69d4f278"), 128UL));
    }

    {
        auto snapshot = state_ref.at(MerkleTreeId::NOTE_HASH_TREE);
        EXPECT_EQ(snapshot,
                  std::make_pair(bb::fr("0x16642d9ccd8346c403aa4c3fa451178b22534a27035cdaa6ec34ae53b29c50cb"), 0UL));
    }

    {
        auto snapshot = state_ref.at(MerkleTreeId::PUBLIC_DATA_TREE);
        EXPECT_EQ(snapshot,
                  std::make_pair(bb::fr("0x021a6cc64c830b4914600d0296c3968c5d28c1b00c5c4b0b33d1f39d948edbd4"), 128UL));
    }

    {
        auto snapshot = state_ref.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE);
        EXPECT_EQ(snapshot,
                  std::make_pair(bb::fr("0x1864fcdaa80ff2719154fa7c8a9050662972707168d69eac9db6fd3110829f80"), 0UL));
    }

    {
        auto snapshot = state_ref.at(MerkleTreeId::ARCHIVE);
        EXPECT_EQ(snapshot,
                  std::make_pair(bb::fr("0x1864fcdaa80ff2719154fa7c8a9050662972707168d69eac9db6fd3110829f80"), 0UL));
    }
}

TEST_F(WorldStateTest, AppendOnlyTrees)
{
    WorldState ws(1, _directory, 1024);

    std::vector tree_ids{ MerkleTreeId::NOTE_HASH_TREE, MerkleTreeId::L1_TO_L2_MESSAGE_TREE, MerkleTreeId::ARCHIVE };

    for (auto tree_id : tree_ids) {
        auto initial = ws.get_tree_info(WorldStateRevision::committed(), tree_id);
        assert_leaf_status<fr>(ws, WorldStateRevision::committed(), tree_id, 0, false);

        ws.append_leaves<fr>(tree_id, { fr(42) });
        assert_leaf_value(ws, WorldStateRevision::uncommitted(), tree_id, 0, fr(42));
        assert_leaf_status<fr>(ws, WorldStateRevision::committed(), tree_id, 0, false);
        assert_leaf_index(ws, WorldStateRevision::uncommitted(), tree_id, fr(42), 0);

        auto uncommitted = ws.get_tree_info(WorldStateRevision::uncommitted(), tree_id);
        // uncommitted state diverges from committed state
        EXPECT_EQ(uncommitted.size, initial.size + 1);
        EXPECT_NE(uncommitted.root, initial.root);

        assert_sibling_path(ws, WorldStateRevision::uncommitted(), tree_id, uncommitted.root, fr(42), 0);

        auto committed = ws.get_tree_info(WorldStateRevision::committed(), tree_id);
        EXPECT_EQ(committed.size, initial.size);
        EXPECT_EQ(committed.root, initial.root);

        ws.commit();
        assert_leaf_value(ws, WorldStateRevision::committed(), tree_id, 0, fr(42));
        assert_leaf_index(ws, WorldStateRevision::committed(), tree_id, fr(42), 0);

        auto after_commit = ws.get_tree_info(WorldStateRevision::committed(), tree_id);
        // commiting updates the committed state
        EXPECT_EQ(after_commit.size, uncommitted.size);
        EXPECT_EQ(after_commit.root, uncommitted.root);

        assert_sibling_path(ws, WorldStateRevision::committed(), tree_id, after_commit.root, fr(42), 0);

        ws.append_leaves<fr>(tree_id, { fr(43) });
        assert_leaf_value(ws, WorldStateRevision::uncommitted(), tree_id, 1, fr(43));
        assert_leaf_status<fr>(ws, WorldStateRevision::committed(), tree_id, 1, false);
        assert_leaf_index(ws, WorldStateRevision::uncommitted(), tree_id, fr(43), 1);

        auto before_rollback = ws.get_tree_info(WorldStateRevision::uncommitted(), tree_id);
        EXPECT_EQ(before_rollback.size, after_commit.size + 1);
        EXPECT_NE(before_rollback.root, after_commit.root);

        ws.rollback();
        assert_leaf_status<fr>(ws, WorldStateRevision::uncommitted(), tree_id, 1, false);
        assert_leaf_status<fr>(ws, WorldStateRevision::committed(), tree_id, 1, false);

        auto after_rollback = ws.get_tree_info(WorldStateRevision::committed(), tree_id);
        // rollback restores the committed state
        EXPECT_EQ(after_rollback.size, after_commit.size);
        EXPECT_EQ(after_rollback.root, after_commit.root);
    }
}

TEST_F(WorldStateTest, AppendOnlyAllowDuplicates)
{
    WorldState ws(1, _directory, 1024);

    std::vector tree_ids{ MerkleTreeId::NOTE_HASH_TREE, MerkleTreeId::L1_TO_L2_MESSAGE_TREE, MerkleTreeId::ARCHIVE };

    for (auto tree_id : tree_ids) {
        ws.append_leaves<fr>(tree_id, { fr(42), fr(42) });
        ws.append_leaves<fr>(tree_id, { fr(42) });

        assert_leaf_value(ws, WorldStateRevision::uncommitted(), tree_id, 0, fr(42));
        assert_leaf_value(ws, WorldStateRevision::uncommitted(), tree_id, 1, fr(42));
        assert_leaf_value(ws, WorldStateRevision::uncommitted(), tree_id, 2, fr(42));

        ws.commit();

        assert_leaf_value(ws, WorldStateRevision::committed(), tree_id, 0, fr(42));
        assert_leaf_value(ws, WorldStateRevision::committed(), tree_id, 1, fr(42));
        assert_leaf_value(ws, WorldStateRevision::committed(), tree_id, 2, fr(42));
    }
}

TEST_F(WorldStateTest, NullifierTree)
{
    WorldState ws(1, _directory, 1024);
    auto tree_id = MerkleTreeId::NULLIFIER_TREE;
    NullifierLeafValue test_nullifier(142);

    auto predecessor_of_142 =
        ws.find_low_leaf_index(WorldStateRevision::committed(), tree_id, test_nullifier.get_key());
    EXPECT_EQ(predecessor_of_142, std::make_pair(false, 127UL));

    ws.append_leaves<NullifierLeafValue>(tree_id, { test_nullifier });
    assert_leaf_value(ws, WorldStateRevision::uncommitted(), tree_id, 128, test_nullifier);

    ws.commit();

    auto test_leaf = ws.get_indexed_leaf<NullifierLeafValue>(WorldStateRevision::committed(), tree_id, 128);
    // at this point 142 should be the biggest leaf so it wraps back to 0
    EXPECT_EQ(test_leaf.value(), IndexedLeaf(test_nullifier, 0, 0));

    auto predecessor_of_142_again =
        ws.find_low_leaf_index(WorldStateRevision::committed(), tree_id, test_nullifier.get_key());
    EXPECT_EQ(predecessor_of_142_again, std::make_pair(true, 128UL));

    auto predecessor_of_143 = ws.find_low_leaf_index(WorldStateRevision::committed(), tree_id, 143);
    EXPECT_EQ(predecessor_of_143, std::make_pair(false, 128UL)); // predecessor is going to be nullifier 142 on slot 127

    auto info = ws.get_tree_info(WorldStateRevision::committed(), tree_id);
    assert_sibling_path(ws,
                        WorldStateRevision::committed(),
                        tree_id,
                        info.root,
                        HashPolicy::hash(test_leaf.value().get_hash_inputs()),
                        128);
}

TEST_F(WorldStateTest, NullifierTreeDuplicates)
{
    WorldState ws(1, _directory, 1024);
    auto tree_id = MerkleTreeId::NULLIFIER_TREE;
    NullifierLeafValue test_nullifier(142);

    ws.append_leaves<NullifierLeafValue>(tree_id, { test_nullifier });
    ws.commit();

    assert_tree_size(ws, WorldStateRevision::committed(), tree_id, 129);
    EXPECT_THROW(ws.append_leaves<NullifierLeafValue>(tree_id, { test_nullifier }), std::runtime_error);
    assert_tree_size(ws, WorldStateRevision::committed(), tree_id, 129);
}

TEST_F(WorldStateTest, NullifierBatchInsert)
{
    WorldState ws(1, _directory, 1024);
    auto response = ws.batch_insert_indexed_leaves<NullifierLeafValue>(
        MerkleTreeId::NULLIFIER_TREE, { NullifierLeafValue(150), NullifierLeafValue(142), NullifierLeafValue(180) }, 2);

    std::vector<std::pair<NullifierLeafValue, size_t>> expected_sorted_leaves = { { NullifierLeafValue(180), 2 },
                                                                                  { NullifierLeafValue(150), 0 },
                                                                                  { NullifierLeafValue(142), 1 } };
    EXPECT_EQ(response.sorted_leaves, expected_sorted_leaves);

    {
        // insertion happens in descending order, but keeping original indices
        // first insert leaf 180, at index 130 (tree had size 127, 180 is the third item => 127 + 3)
        // predecessor will be 127, currently linked to head of the list (0)
        auto low_leaf = response.low_leaf_witness_data[0];
        auto expected_low_leaf = IndexedLeaf(NullifierLeafValue(127), 0, fr(0));
        EXPECT_EQ(low_leaf.index, 127);
        EXPECT_EQ(low_leaf.leaf, expected_low_leaf);
    }

    {
        // insert 150 on position 128 (127 + 1)
        // predecessor will be 127 linked to 180
        auto low_leaf = response.low_leaf_witness_data[1];
        auto expected_low_leaf = IndexedLeaf(NullifierLeafValue(127), 130, fr(180));
        EXPECT_EQ(low_leaf.index, 127);
        EXPECT_EQ(low_leaf.leaf, expected_low_leaf);
    }

    {
        // finally, insert 142 on position 129(127 + 2)
        // prededecessor will be 127 linked to 150
        auto low_leaf = response.low_leaf_witness_data[2];
        auto expected_low_leaf = IndexedLeaf(NullifierLeafValue(127), 128, fr(150));
        EXPECT_EQ(low_leaf.index, 127);
        EXPECT_EQ(low_leaf.leaf, expected_low_leaf);
    }
}

TEST_F(WorldStateTest, PublicDataTree)
{
    WorldState ws(1, _directory, 1024);

    ws.append_leaves(MerkleTreeId::PUBLIC_DATA_TREE, std::vector{ PublicDataLeafValue(142, 0) });
    assert_tree_size(ws, WorldStateRevision::uncommitted(), MerkleTreeId::PUBLIC_DATA_TREE, 129);

    auto leaf = ws.get_indexed_leaf<PublicDataLeafValue>(
        WorldStateRevision::uncommitted(), MerkleTreeId::PUBLIC_DATA_TREE, 128);
    EXPECT_EQ(leaf.value().value, PublicDataLeafValue(142, 0));

    ws.update_public_data(PublicDataLeafValue(142, 1));
    // updating insert a dummy leaf
    assert_tree_size(ws, WorldStateRevision::uncommitted(), MerkleTreeId::PUBLIC_DATA_TREE, 130);

    leaf = ws.get_indexed_leaf<PublicDataLeafValue>(
        WorldStateRevision::uncommitted(), MerkleTreeId::PUBLIC_DATA_TREE, 128);
    EXPECT_EQ(leaf.value().value, PublicDataLeafValue(142, 1));
}

TEST_F(WorldStateTest, CommitsAndRollsBackAllTrees)
{
    WorldState ws(1, _directory, 1024);

    ws.append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, { fr(42) });
    ws.append_leaves<fr>(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, { fr(42) });
    ws.append_leaves<fr>(MerkleTreeId::ARCHIVE, { fr(42) });
    ws.append_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { NullifierLeafValue(142) });
    ws.append_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, { PublicDataLeafValue(142, 1) });

    ws.commit();

    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::NOTE_HASH_TREE, 0, fr(42));
    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 0, fr(42));
    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::ARCHIVE, 0, fr(42));
    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::NULLIFIER_TREE, 128, NullifierLeafValue(142));
    assert_leaf_value(
        ws, WorldStateRevision::committed(), MerkleTreeId::PUBLIC_DATA_TREE, 128, PublicDataLeafValue(142, 1));

    ws.append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, { fr(43) });
    ws.append_leaves<fr>(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, { fr(43) });
    ws.append_leaves<fr>(MerkleTreeId::ARCHIVE, { fr(43) });
    ws.append_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { NullifierLeafValue(143) });
    ws.append_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, { PublicDataLeafValue(143, 1) });

    ws.rollback();

    assert_leaf_exists(ws, WorldStateRevision::committed(), MerkleTreeId::NOTE_HASH_TREE, fr(43), false);
    assert_leaf_exists(ws, WorldStateRevision::committed(), MerkleTreeId::L1_TO_L2_MESSAGE_TREE, fr(43), false);
    assert_leaf_exists(ws, WorldStateRevision::committed(), MerkleTreeId::ARCHIVE, fr(43), false);
    assert_leaf_exists(
        ws, WorldStateRevision::committed(), MerkleTreeId::NULLIFIER_TREE, NullifierLeafValue(143), false);
    assert_leaf_exists(
        ws, WorldStateRevision::committed(), MerkleTreeId::PUBLIC_DATA_TREE, PublicDataLeafValue(143, 1), false);
}

TEST_F(WorldStateTest, SyncExternalBlockFromEmpty)
{
    WorldState ws(1, _directory, 1024);
    StateReference block_state_ref = {
        { MerkleTreeId::NULLIFIER_TREE,
          { fr("0x01199bf7edd983a21dc7ce96c1f9c5c0d0108c937fdc46bb3db7987656a35665"), 129 } },
        { MerkleTreeId::NOTE_HASH_TREE,
          { fr("0x1410e433e78ca647cf34320490ab1375d4574315ae378f41fc841d3d91424f13"), 1 } },
        { MerkleTreeId::PUBLIC_DATA_TREE,
          { fr("0x1ccc2bf4779cc32232d7a0768e42ba5f59e9a18033737fe2893392a7911ebde3"), 129 } },
        { MerkleTreeId::L1_TO_L2_MESSAGE_TREE,
          { fr("0x2a60676faba566f0479425455775fa46964192e4b12ffcbb2179eabf7589a49d"), 1 } },
    };

    BlockData block{ .block_state_ref = block_state_ref,
                     .block_hash = fr(1),
                     .new_notes = { 42 },
                     .new_l1_to_l2_messages = { 43 },
                     .new_nullifiers = { NullifierLeafValue(144) },
                     .batches_of_public_writes = { { PublicDataLeafValue(145, 1) } } };

    bool sync_res = ws.sync_block(block);
    EXPECT_EQ(sync_res, false);

    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::NOTE_HASH_TREE, 0, fr(42));
    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 0, fr(43));
    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::NULLIFIER_TREE, 128, NullifierLeafValue(144));
    assert_leaf_value(
        ws, WorldStateRevision::committed(), MerkleTreeId::PUBLIC_DATA_TREE, 128, PublicDataLeafValue(145, 1));
    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::ARCHIVE, 0, fr(1));

    auto state_ref = ws.get_state_reference(WorldStateRevision::committed());
    for (const auto& [tree_id, snapshot] : block_state_ref) {
        EXPECT_EQ(state_ref.at(tree_id), snapshot);
    }
}

TEST_F(WorldStateTest, SyncBlockFromDirtyState)
{
    WorldState ws(1, _directory, 1024);
    StateReference block_state_ref = {
        { MerkleTreeId::NULLIFIER_TREE,
          { fr("0x01199bf7edd983a21dc7ce96c1f9c5c0d0108c937fdc46bb3db7987656a35665"), 129 } },
        { MerkleTreeId::NOTE_HASH_TREE,
          { fr("0x1410e433e78ca647cf34320490ab1375d4574315ae378f41fc841d3d91424f13"), 1 } },
        { MerkleTreeId::PUBLIC_DATA_TREE,
          { fr("0x1ccc2bf4779cc32232d7a0768e42ba5f59e9a18033737fe2893392a7911ebde3"), 129 } },
        { MerkleTreeId::L1_TO_L2_MESSAGE_TREE,
          { fr("0x2a60676faba566f0479425455775fa46964192e4b12ffcbb2179eabf7589a49d"), 1 } },
    };

    BlockData block{ .block_state_ref = block_state_ref,
                     .block_hash = fr(1),
                     .new_notes = { 42 },
                     .new_l1_to_l2_messages = { 43 },
                     .new_nullifiers = { NullifierLeafValue(144) },
                     .batches_of_public_writes = { { PublicDataLeafValue(145, 1) } } };

    ws.append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, { fr(142) });
    ws.append_leaves<fr>(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, { fr(143) });
    ws.append_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { NullifierLeafValue(142) });
    ws.append_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, { PublicDataLeafValue(142, 1) });

    auto uncommitted_state_ref = ws.get_state_reference(WorldStateRevision::uncommitted());
    for (const auto& [tree_id, snapshot] : block_state_ref) {
        EXPECT_NE(uncommitted_state_ref.at(tree_id), snapshot);
    }

    bool sync_res = ws.sync_block(block);
    EXPECT_EQ(sync_res, false);

    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::NOTE_HASH_TREE, 0, fr(42));
    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::L1_TO_L2_MESSAGE_TREE, 0, fr(43));
    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::NULLIFIER_TREE, 128, NullifierLeafValue(144));
    assert_leaf_value(
        ws, WorldStateRevision::committed(), MerkleTreeId::PUBLIC_DATA_TREE, 128, PublicDataLeafValue(145, 1));
    assert_leaf_value(ws, WorldStateRevision::committed(), MerkleTreeId::ARCHIVE, 0, fr(1));

    auto state_ref = ws.get_state_reference(WorldStateRevision::committed());
    for (const auto& [tree_id, snapshot] : block_state_ref) {
        EXPECT_EQ(state_ref.at(tree_id), snapshot);
    }
}

TEST_F(WorldStateTest, SyncCurrentBlock)
{
    WorldState ws(1, _directory, 1024);
    StateReference block_state_ref = {
        { MerkleTreeId::NULLIFIER_TREE,
          { fr("0x01199bf7edd983a21dc7ce96c1f9c5c0d0108c937fdc46bb3db7987656a35665"), 129 } },
        { MerkleTreeId::NOTE_HASH_TREE,
          { fr("0x1410e433e78ca647cf34320490ab1375d4574315ae378f41fc841d3d91424f13"), 1 } },
        { MerkleTreeId::PUBLIC_DATA_TREE,
          { fr("0x1ccc2bf4779cc32232d7a0768e42ba5f59e9a18033737fe2893392a7911ebde3"), 129 } },
        { MerkleTreeId::L1_TO_L2_MESSAGE_TREE,
          { fr("0x2a60676faba566f0479425455775fa46964192e4b12ffcbb2179eabf7589a49d"), 1 } },
    };

    BlockData block{ .block_state_ref = block_state_ref,
                     .block_hash = fr(1),
                     .new_notes = { 42 },
                     .new_l1_to_l2_messages = { 43 },
                     .new_nullifiers = { NullifierLeafValue(144) },
                     .batches_of_public_writes = { { PublicDataLeafValue(145, 1) } } };

    ws.append_leaves<fr>(MerkleTreeId::NOTE_HASH_TREE, block.new_notes);
    ws.append_leaves<fr>(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, block.new_l1_to_l2_messages);
    ws.append_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, block.new_nullifiers);
    ws.append_leaves<PublicDataLeafValue>(MerkleTreeId::PUBLIC_DATA_TREE, block.batches_of_public_writes[0]);

    auto uncommitted_state_ref = ws.get_state_reference(WorldStateRevision::uncommitted());
    for (const auto& [tree_id, snapshot] : block_state_ref) {
        EXPECT_EQ(uncommitted_state_ref.at(tree_id), snapshot);
    }

    bool sync_res = ws.sync_block(block);
    EXPECT_EQ(sync_res, true);

    assert_leaf_value(ws, WorldStateRevision::uncommitted(), MerkleTreeId::ARCHIVE, 0, fr(1));

    auto state_ref = ws.get_state_reference(WorldStateRevision::committed());
    for (const auto& [tree_id, snapshot] : block_state_ref) {
        EXPECT_EQ(state_ref.at(tree_id), snapshot);
    }
}
