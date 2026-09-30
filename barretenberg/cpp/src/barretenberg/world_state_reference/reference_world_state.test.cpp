#include "barretenberg/world_state_reference/reference_world_state.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"

#include <gtest/gtest.h>

#include <algorithm>

using namespace bb;
using namespace bb::world_state;

namespace {

const WorldStateRevision LATEST_UNCOMMITTED{ .includeUncommitted = true };
const WorldStateRevision LATEST_COMMITTED{ .includeUncommitted = false };
const WorldStateRevision GENESIS_BLOCK{ .blockNumber = 0 };

// Recompute a tree root from a leaf hash and its sibling path.
template <typename HashPolicy> FF root_from_path(FF node, uint64_t index, const SiblingPath& path)
{
    for (const auto& sibling : path) {
        node = (index & 1) == 0 ? HashPolicy::hash_pair(node, sibling) : HashPolicy::hash_pair(sibling, node);
        index >>= 1;
    }
    return node;
}

} // namespace

TEST(ReferenceWorldState, CanonicalGenesisMatchesProtocolConstants)
{
    ReferenceWorldState ws;

    auto nullifiers = ws.get_tree_info(LATEST_COMMITTED, MerkleTreeId::NULLIFIER_TREE);
    EXPECT_EQ(nullifiers.root, FF(GENESIS_NULLIFIER_TREE_ROOT));
    EXPECT_EQ(nullifiers.size, ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE);

    EXPECT_EQ(ws.genesis_block_header_hash(), FF(GENESIS_BLOCK_HEADER_HASH));
    auto archive = ws.get_tree_info(LATEST_COMMITTED, MerkleTreeId::ARCHIVE);
    EXPECT_EQ(archive.root, FF(GENESIS_ARCHIVE_ROOT));
    EXPECT_EQ(archive.size, 1);
    EXPECT_EQ(ws.get_leaf_value(LATEST_COMMITTED, MerkleTreeId::ARCHIVE, 0), FF(GENESIS_BLOCK_HEADER_HASH));
}

TEST(ReferenceWorldState, EmptyGenesisMatchesEmptyWorldStateRoots)
{
    // The empty-tree roots hash_of_genesis_block_header in block_header.nr uses for the unseeded trees.
    ReferenceWorldState ws(GenesisConfig{});
    auto state = ws.get_initial_state_reference();
    ASSERT_EQ(state.size(), 4);
    for (const auto& tree : state) {
        switch (tree.tree_id) {
        case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
            EXPECT_EQ(tree.root, FF("0x0fef6d80d31109ddb56d6b3f607cbc9c0af0bff3ea0d43e8f278983c64c11f7a"));
            EXPECT_EQ(tree.size, 0);
            break;
        case MerkleTreeId::NOTE_HASH_TREE:
            EXPECT_EQ(tree.root, FF("0x2590f2aab19dd791700b4a43d3f52bb88ef2409a3731da8e848663559202e4c6"));
            EXPECT_EQ(tree.size, 0);
            break;
        case MerkleTreeId::PUBLIC_DATA_TREE:
            EXPECT_EQ(tree.root, FF("0x1bef38b621017d3c7416663d0cd81369424560710526a3fbaaec13e356b9d084"));
            EXPECT_EQ(tree.size, 128);
            break;
        case MerkleTreeId::NULLIFIER_TREE:
            EXPECT_EQ(tree.size, 128);
            EXPECT_NE(tree.root, FF(GENESIS_NULLIFIER_TREE_ROOT));
            break;
        default:
            ADD_FAILURE() << "unexpected tree in state reference";
        }
    }
}

TEST(ReferenceWorldState, GenesisPrefillValidation)
{
    auto with_nullifiers = [](std::vector<FF> keys) {
        GenesisConfig genesis;
        for (auto key : keys) {
            genesis.prefilled_nullifiers.emplace_back(key);
        }
        return ReferenceWorldState::check_genesis(genesis);
    };
    EXPECT_FALSE(with_nullifiers({ FF(1000), FF(2000) }).has_value());
    EXPECT_EQ(with_nullifiers({ FF(2000), FF(1000) }),
              "prefilled nullifiers: Prefilled values must be unique and sorted");
    EXPECT_EQ(with_nullifiers({ FF(1000), FF(1000) }),
              "prefilled nullifiers: Prefilled values must be unique and sorted");
    // Padding occupies keys 0..127 when one value is prefilled, so a key of 5 collides with it.
    EXPECT_EQ(with_nullifiers({ FF(5) }),
              "prefilled nullifiers: Prefilled values must not be the same as the default values");
    std::vector<FF> too_many;
    for (size_t i = 0; i < ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE + 1; ++i) {
        too_many.emplace_back(1000 + i);
    }
    EXPECT_EQ(with_nullifiers(too_many),
              "prefilled nullifiers: Number of prefilled values can't be more than initial size");

    GenesisConfig public_data;
    public_data.prefilled_public_data = { PublicDataLeafValue(FF(2000), FF(1)), PublicDataLeafValue(FF(1000), FF(2)) };
    EXPECT_EQ(ReferenceWorldState::check_genesis(public_data),
              "prefilled public data: Prefilled values must be unique and sorted");
}

TEST(ReferenceWorldState, RevisionAndForkChecks)
{
    EXPECT_FALSE(ReferenceWorldState::check_revision(LATEST_UNCOMMITTED).has_value());
    EXPECT_FALSE(ReferenceWorldState::check_revision(GENESIS_BLOCK).has_value());
    EXPECT_TRUE(ReferenceWorldState::check_revision(WorldStateRevision{ .blockNumber = 3 }).has_value());
    EXPECT_TRUE(ReferenceWorldState::check_revision(WorldStateRevision{ .forkId = 1 }).has_value());
    EXPECT_FALSE(ReferenceWorldState::check_fork(0).has_value());
    EXPECT_EQ(ReferenceWorldState::check_fork(2), "the reference world state has one fork (0), not 2");
}

TEST(ReferenceWorldState, CommittedReadsSeeGenesisUncommittedSeeCurrent)
{
    ReferenceWorldState ws;
    const std::vector<FF> note_hashes{ FF(11), FF(22), FF(33) };
    ws.append_leaves(MerkleTreeId::NOTE_HASH_TREE, note_hashes);

    EXPECT_EQ(ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE).size, 3);
    EXPECT_EQ(ws.get_tree_info(LATEST_COMMITTED, MerkleTreeId::NOTE_HASH_TREE).size, 0);
    EXPECT_EQ(ws.get_tree_info(GENESIS_BLOCK, MerkleTreeId::NOTE_HASH_TREE).size, 0);

    EXPECT_EQ(ws.get_leaf_value(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, 1), FF(22));
    EXPECT_EQ(ws.get_leaf_value(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, 3), std::nullopt);
    EXPECT_EQ(ws.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, FF(33), 0), 2);
    EXPECT_EQ(ws.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, FF(11), 1), std::nullopt);
    EXPECT_EQ(ws.find_leaf_index(LATEST_COMMITTED, MerkleTreeId::NOTE_HASH_TREE, FF(33), 0), std::nullopt);

    auto path = ws.get_sibling_path(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, 1);
    EXPECT_EQ(path.size(), NOTE_HASH_TREE_HEIGHT);
    EXPECT_EQ(root_from_path<aztec::AztecMerkleHashPolicy>(FF(22), 1, path),
              ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE).root);
}

TEST(ReferenceWorldState, NullifierInsertionWitnessesAreConsistent)
{
    ReferenceWorldState ws;
    const FF nullifier(0x1234);
    ASSERT_FALSE(ws.has_nullifier(nullifier));
    auto low = ws.find_low_leaf(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE, nullifier);
    EXPECT_FALSE(low.is_already_present);

    auto result = ws.insert_nullifier(NullifierLeafValue(nullifier));
    ASSERT_EQ(result.low_leaf_witness_data.size(), 1);
    ASSERT_EQ(result.insertion_witness_data.size(), 1);
    EXPECT_EQ(result.low_leaf_witness_data[0].index, low.index);
    EXPECT_EQ(result.insertion_witness_data[0].index, ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE);

    EXPECT_TRUE(ws.has_nullifier(nullifier));
    auto index = ws.find_indexed_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE, nullifier, 0);
    ASSERT_EQ(index, ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE);
    auto preimage = ws.get_nullifier_preimage(LATEST_UNCOMMITTED, *index);
    ASSERT_TRUE(preimage.has_value());
    EXPECT_EQ(preimage->leaf.nullifier, nullifier);
    // The low leaf now points at the new leaf.
    EXPECT_EQ(ws.get_nullifier_preimage(LATEST_UNCOMMITTED, low.index)->nextKey, nullifier);

    // A membership witness read back from the tree reproduces its root.
    auto path = ws.get_sibling_path(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE, *index);
    FF leaf_hash = aztec::NullifierMerkleHashPolicy::hash(preimage->get_hash_inputs());
    EXPECT_EQ(root_from_path<aztec::NullifierMerkleHashPolicy>(leaf_hash, *index, path),
              ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE).root);

    // The genesis view is untouched.
    EXPECT_EQ(ws.get_tree_info(LATEST_COMMITTED, MerkleTreeId::NULLIFIER_TREE).root, FF(GENESIS_NULLIFIER_TREE_ROOT));
}

TEST(ReferenceWorldState, PublicDataUpdatesInPlace)
{
    ReferenceWorldState ws;
    ws.insert_public_data(PublicDataLeafValue(FF(5000), FF(1)));
    auto size_after_insert = ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::PUBLIC_DATA_TREE).size;
    ws.insert_public_data(PublicDataLeafValue(FF(5000), FF(2)));
    EXPECT_EQ(ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::PUBLIC_DATA_TREE).size, size_after_insert);
    auto index = ws.find_indexed_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::PUBLIC_DATA_TREE, FF(5000), 0);
    ASSERT_TRUE(index.has_value());
    EXPECT_EQ(ws.get_public_data_preimage(LATEST_UNCOMMITTED, *index)->leaf.value, FF(2));
}

TEST(ReferenceWorldState, CheckpointsRevertAndCommit)
{
    ReferenceWorldState ws;
    ws.create_checkpoint();
    ws.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(1) });
    ws.create_checkpoint();
    ws.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(2) });
    ws.revert_checkpoint();
    EXPECT_EQ(ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE).size, 1);
    ws.commit_checkpoint();
    EXPECT_FALSE(ws.has_checkpoint());
    EXPECT_EQ(ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE).size, 1);

    ws.create_checkpoint();
    ws.create_checkpoint();
    ws.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(3) });
    ws.revert_all_checkpoints();
    EXPECT_FALSE(ws.has_checkpoint());
    EXPECT_EQ(ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE).size, 1);
}

TEST(ReferenceWorldState, UpdateArchiveRequiresTheCurrentState)
{
    ReferenceWorldState ws;
    ws.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(7) });
    auto current = ws.get_state_reference(LATEST_UNCOMMITTED);
    EXPECT_TRUE(ws.state_matches(current));
    EXPECT_FALSE(ws.state_matches(ws.get_initial_state_reference()));
    // Order is not part of the contract.
    std::reverse(current.begin(), current.end());
    EXPECT_TRUE(ws.state_matches(current));

    ws.update_archive(FF(99));
    EXPECT_EQ(ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::ARCHIVE).size, 2);
    EXPECT_EQ(ws.get_leaf_value(LATEST_UNCOMMITTED, MerkleTreeId::ARCHIVE, 1), FF(99));
    EXPECT_EQ(ws.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::ARCHIVE, FF(99), 0), 1);
}
