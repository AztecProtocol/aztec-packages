#include "barretenberg/world_state_reference/reference_world_state.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <stdexcept>

using namespace bb;
using namespace bb::world_state;

namespace {

constexpr uint64_t CANONICAL = 0;
const WorldStateRevision LATEST_UNCOMMITTED{ .includeUncommitted = true };
const WorldStateRevision LATEST_COMMITTED{ .includeUncommitted = false };

WorldStateRevision at_block(block_number_t block)
{
    return WorldStateRevision{ .blockNumber = block };
}

WorldStateRevision fork_current(uint64_t fork_id)
{
    return WorldStateRevision{ .forkId = fork_id, .includeUncommitted = true };
}

// Recompute a tree root from a leaf hash and its sibling path.
template <typename HashPolicy> FF root_from_path(FF node, uint64_t index, const SiblingPath& path)
{
    for (const auto& sibling : path) {
        node = (index & 1) == 0 ? HashPolicy::hash_pair(node, sibling) : HashPolicy::hash_pair(sibling, node);
        index >>= 1;
    }
    return node;
}

uint64_t size_of(const ReferenceWorldState& ws, const WorldStateRevision& revision, MerkleTreeId tree_id)
{
    return ws.get_tree_info(revision, tree_id).size;
}

/** Commits a block that appends `note_hash` and nullifies `nullifier`, the way a node syncs one. */
void sync_block(ReferenceWorldState& ws, FF note_hash, FF nullifier)
{
    uint64_t fork_id = ws.create_fork(std::nullopt);
    std::vector<FF> notes{ note_hash };
    std::vector<NullifierLeafValue> nullifiers{ NullifierLeafValue(nullifier) };
    ws.append_leaves(fork_id, MerkleTreeId::NOTE_HASH_TREE, notes);
    ws.batch_insert_nullifiers(fork_id, nullifiers, 0);
    auto state = ws.get_state_reference(fork_current(fork_id));
    FF header_hash = FF(1000) + FF(ws.latest_block_number());
    ws.delete_fork(fork_id);
    ws.sync_block(state, header_hash, notes, {}, nullifiers, {}, std::nullopt, std::nullopt);
}

} // namespace

TEST(ReferenceWorldState, CanonicalGenesisMatchesProtocolConstants)
{
    ReferenceWorldState ws;

    auto nullifiers = ws.get_tree_info(LATEST_COMMITTED, MerkleTreeId::NULLIFIER_TREE);
    EXPECT_EQ(nullifiers.root, FF(GENESIS_NULLIFIER_TREE_ROOT));
    EXPECT_EQ(nullifiers.size, ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE);

    auto archive = ws.get_tree_info(LATEST_COMMITTED, MerkleTreeId::ARCHIVE);
    EXPECT_EQ(archive.root, FF(GENESIS_ARCHIVE_ROOT));
    EXPECT_EQ(archive.size, 1);
    EXPECT_EQ(ws.get_leaf_value(LATEST_COMMITTED, MerkleTreeId::ARCHIVE, 0), FF(GENESIS_BLOCK_HEADER_HASH));
    EXPECT_EQ(ws.latest_block_number(), 0);
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
    EXPECT_THROW(ReferenceWorldState{ public_data }, std::runtime_error);
}

TEST(ReferenceWorldState, CommittedReadsSeeTheLastBlockUncommittedSeeCurrent)
{
    ReferenceWorldState ws;
    const std::vector<FF> note_hashes{ FF(11), FF(22), FF(33) };
    ws.append_leaves(CANONICAL, MerkleTreeId::NOTE_HASH_TREE, note_hashes);

    EXPECT_EQ(size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE), 3);
    EXPECT_EQ(size_of(ws, LATEST_COMMITTED, MerkleTreeId::NOTE_HASH_TREE), 0);
    EXPECT_EQ(size_of(ws, at_block(0), MerkleTreeId::NOTE_HASH_TREE), 0);

    EXPECT_EQ(ws.get_leaf_value(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, 1), FF(22));
    EXPECT_EQ(ws.get_leaf_value(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, 3), FF(0));
    EXPECT_EQ(ws.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, FF(33), 0), 2);
    EXPECT_EQ(ws.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, FF(11), 1), std::nullopt);
    EXPECT_EQ(ws.find_leaf_index(LATEST_COMMITTED, MerkleTreeId::NOTE_HASH_TREE, FF(33), 0), std::nullopt);

    auto path = ws.get_sibling_path(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, 1);
    EXPECT_EQ(path.size(), NOTE_HASH_TREE_HEIGHT);
    EXPECT_EQ(root_from_path<aztec::AztecMerkleHashPolicy>(FF(22), 1, path),
              ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE).root);

    ws.commit();
    EXPECT_EQ(ws.latest_block_number(), 1);
    EXPECT_EQ(size_of(ws, LATEST_COMMITTED, MerkleTreeId::NOTE_HASH_TREE), 3);
    EXPECT_EQ(size_of(ws, at_block(0), MerkleTreeId::NOTE_HASH_TREE), 0);
    EXPECT_EQ(size_of(ws, at_block(1), MerkleTreeId::NOTE_HASH_TREE), 3);
    EXPECT_THROW(ws.get_tree_info(at_block(2), MerkleTreeId::NOTE_HASH_TREE), std::runtime_error);
}

TEST(ReferenceWorldState, ForksAreIsolatedAndCommittedReadsSeeTheirBlock)
{
    ReferenceWorldState ws;
    sync_block(ws, FF(1), FF(0x1001));
    sync_block(ws, FF(2), FF(0x1002));
    ASSERT_EQ(ws.latest_block_number(), 2);

    uint64_t at_latest = ws.create_fork(std::nullopt);
    uint64_t at_one = ws.create_fork(1);
    ws.append_leaves(at_latest, MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(3) });

    EXPECT_EQ(size_of(ws, fork_current(at_latest), MerkleTreeId::NOTE_HASH_TREE), 3);
    EXPECT_EQ(size_of(ws, WorldStateRevision{ .forkId = at_latest }, MerkleTreeId::NOTE_HASH_TREE), 2);
    EXPECT_EQ(size_of(ws, fork_current(at_one), MerkleTreeId::NOTE_HASH_TREE), 1);
    EXPECT_EQ(size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE), 2);
    EXPECT_EQ(ws.find_leaf_index(fork_current(at_latest), MerkleTreeId::NOTE_HASH_TREE, FF(3), 0), 2);
    EXPECT_EQ(ws.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE, FF(3), 0), std::nullopt);

    // Leaves are numbered by the committed block that added them; a fork's uncommitted ones have none.
    std::vector<uint64_t> indices{ 0, 1, 2 };
    auto blocks = ws.get_block_numbers_for_leaf_indices(fork_current(at_latest), MerkleTreeId::NOTE_HASH_TREE, indices);
    EXPECT_EQ(blocks, (std::vector<std::optional<block_number_t>>{ 1, 2, std::nullopt }));
    blocks = ws.get_block_numbers_for_leaf_indices(LATEST_COMMITTED, MerkleTreeId::NULLIFIER_TREE, indices);
    EXPECT_EQ(blocks, (std::vector<std::optional<block_number_t>>{ 0, 0, 0 }));

    EXPECT_THROW(ws.delete_fork(CANONICAL), std::runtime_error);
    ws.delete_fork(at_one);
    EXPECT_THROW(ws.get_tree_info(fork_current(at_one), MerkleTreeId::NOTE_HASH_TREE), std::runtime_error);
    EXPECT_THROW(ws.create_fork(3), std::runtime_error);
}

TEST(ReferenceWorldState, SyncBlockChecksTheStateAndCommitsNothingOnFailure)
{
    ReferenceWorldState ws;
    std::vector<FF> notes{ FF(5) };
    auto initial = ws.get_state_reference(LATEST_COMMITTED);
    // The block claims the state before its own effects, so the result does not match it.
    EXPECT_THROW(ws.sync_block(initial, FF(77), notes, {}, {}, {}, std::nullopt, std::nullopt), std::runtime_error);
    EXPECT_EQ(ws.latest_block_number(), 0);
    EXPECT_EQ(size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE), 0);

    FF genesis_archive = ws.get_tree_info(LATEST_COMMITTED, MerkleTreeId::ARCHIVE).root;
    EXPECT_THROW(ws.sync_block(initial, FF(77), {}, {}, {}, {}, std::nullopt, FF(123)), std::runtime_error);
    ws.sync_block(initial, FF(77), {}, {}, {}, {}, std::nullopt, genesis_archive);
    EXPECT_EQ(ws.latest_block_number(), 1);
    EXPECT_EQ(ws.get_leaf_value(LATEST_COMMITTED, MerkleTreeId::ARCHIVE, 1), FF(77));
    // A header hash already in the archive is not its tip.
    EXPECT_THROW(ws.sync_block(initial, FF(77), {}, {}, {}, {}, std::nullopt, std::nullopt), std::runtime_error);
}

TEST(ReferenceWorldState, UnwindDropsBlocksAndTheirForks)
{
    ReferenceWorldState ws;
    sync_block(ws, FF(1), FF(0x1001));
    sync_block(ws, FF(2), FF(0x1002));
    sync_block(ws, FF(3), FF(0x1003));
    uint64_t at_three = ws.create_fork(std::nullopt);
    uint64_t at_one = ws.create_fork(1);
    FF root_at_one = ws.get_tree_info(at_block(1), MerkleTreeId::NULLIFIER_TREE).root;

    EXPECT_THROW(ws.unwind_blocks(3), std::runtime_error);
    ws.unwind_blocks(1);
    EXPECT_EQ(ws.latest_block_number(), 1);
    EXPECT_EQ(ws.get_tree_info(LATEST_COMMITTED, MerkleTreeId::NULLIFIER_TREE).root, root_at_one);
    EXPECT_THROW(ws.get_tree_info(fork_current(at_three), MerkleTreeId::NULLIFIER_TREE), std::runtime_error);
    EXPECT_EQ(ws.get_tree_info(fork_current(at_one), MerkleTreeId::NULLIFIER_TREE).root, root_at_one);

    // The chain carries on from block 1, and a finalized block cannot be unwound.
    sync_block(ws, FF(4), FF(0x1004));
    EXPECT_EQ(ws.latest_block_number(), 2);
    ws.finalize_blocks(2);
    EXPECT_EQ(ws.status().finalized_block_number, 2);
    sync_block(ws, FF(5), FF(0x1005));
    EXPECT_THROW(ws.unwind_blocks(1), std::runtime_error);
    EXPECT_THROW(ws.finalize_blocks(9), std::runtime_error);
}

TEST(ReferenceWorldState, RemovingHistoryStopsReadsOfOldBlocks)
{
    ReferenceWorldState ws;
    EXPECT_EQ(ws.status().oldest_historical_block, 0);
    for (int i = 1; i <= 4; ++i) {
        sync_block(ws, FF(i), FF(0x1000 + i));
    }
    EXPECT_EQ(ws.status().oldest_historical_block, 1);
    EXPECT_THROW(ws.remove_historical_blocks(3), std::runtime_error);
    ws.finalize_blocks(3);
    ws.remove_historical_blocks(3);
    EXPECT_EQ(ws.status().oldest_historical_block, 3);
    EXPECT_THROW(ws.get_tree_info(at_block(2), MerkleTreeId::NOTE_HASH_TREE), std::runtime_error);
    EXPECT_EQ(size_of(ws, at_block(3), MerkleTreeId::NOTE_HASH_TREE), 3);
    EXPECT_THROW(ws.remove_historical_blocks(3), std::runtime_error);
}

TEST(ReferenceWorldState, SequentialNullifierWitnessesAreConsistent)
{
    ReferenceWorldState ws;
    const FF nullifier(0x1234);
    auto low = ws.find_low_leaf(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE, nullifier);
    EXPECT_FALSE(low.is_already_present);

    std::vector<NullifierLeafValue> leaves{ NullifierLeafValue(nullifier) };
    auto result = ws.sequential_insert_nullifiers(CANONICAL, leaves);
    ASSERT_EQ(result.low_leaf_witness_data.size(), 1);
    ASSERT_EQ(result.insertion_witness_data.size(), 1);
    EXPECT_EQ(result.low_leaf_witness_data[0].index, low.index);
    EXPECT_EQ(result.insertion_witness_data[0].index, ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE);

    auto index = ws.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE, nullifier, 0);
    ASSERT_EQ(index, ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE);
    auto preimage = ws.get_nullifier_preimage(LATEST_UNCOMMITTED, *index);
    ASSERT_TRUE(preimage.has_value());
    EXPECT_EQ(preimage->leaf.nullifier, nullifier);
    EXPECT_EQ(ws.get_nullifier_preimage(LATEST_UNCOMMITTED, low.index)->nextKey, nullifier);

    // A membership witness read back from the tree reproduces its root.
    auto path = ws.get_sibling_path(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE, *index);
    FF leaf_hash = aztec::NullifierMerkleHashPolicy::hash(preimage->get_hash_inputs());
    EXPECT_EQ(root_from_path<aztec::NullifierMerkleHashPolicy>(leaf_hash, *index, path),
              ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE).root);

    // Inserting it again fails and changes nothing; the committed view is untouched throughout.
    FF root = ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE).root;
    EXPECT_THROW(ws.sequential_insert_nullifiers(CANONICAL, leaves), std::runtime_error);
    EXPECT_EQ(ws.get_tree_info(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE).root, root);
    EXPECT_EQ(ws.get_tree_info(LATEST_COMMITTED, MerkleTreeId::NULLIFIER_TREE).root, FF(GENESIS_NULLIFIER_TREE_ROOT));
}

TEST(ReferenceWorldState, BatchInsertionTakesOneSlotPerValue)
{
    // A batch takes one slot per value at the value's own position, a zero value's left empty, and links
    // the values in key order, updating low leaves in descending key order.
    ReferenceWorldState batch;
    std::vector<NullifierLeafValue> leaves{ NullifierLeafValue(FF(0x3000)),
                                            NullifierLeafValue(FF(0)),
                                            NullifierLeafValue(FF(0x1000)),
                                            NullifierLeafValue(FF(0x2000)) };
    auto result = batch.batch_insert_nullifiers(CANONICAL, leaves, 2);
    EXPECT_EQ(size_of(batch, LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE),
              ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE + 4);
    // The zero value's slot is empty: it reads as the empty leaf, as on a node.
    EXPECT_EQ(batch.get_nullifier_preimage(LATEST_UNCOMMITTED, ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE + 1),
              IndexedLeaf<NullifierLeafValue>::empty());

    ASSERT_EQ(result.sorted_leaves.size(), 4);
    EXPECT_EQ(result.sorted_leaves[0].second, 0);
    EXPECT_EQ(result.sorted_leaves[1].second, 3);
    EXPECT_EQ(result.sorted_leaves[2].second, 2);
    EXPECT_EQ(result.sorted_leaves[3].second, 1);
    ASSERT_EQ(result.low_leaf_witness_data.size(), 4);
    EXPECT_EQ(result.low_leaf_witness_data[3].index, 0);
    EXPECT_EQ(result.subtree_path.size(), NULLIFIER_TREE_HEIGHT - 2);

    // Every value is linked in key order.
    for (size_t i = 0; i < leaves.size(); ++i) {
        if (leaves[i].is_empty()) {
            continue;
        }
        auto index = batch.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE, leaves[i].nullifier, 0);
        EXPECT_EQ(index, ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE + i);
    }
    auto low_of_2000 = batch.find_low_leaf(LATEST_UNCOMMITTED, MerkleTreeId::NULLIFIER_TREE, FF(0x2000));
    EXPECT_TRUE(low_of_2000.is_already_present);
    EXPECT_EQ(
        batch.get_nullifier_preimage(LATEST_UNCOMMITTED, ReferenceWorldState::INDEXED_TREE_INITIAL_SIZE + 2)->nextKey,
        FF(0x2000));

    std::vector<NullifierLeafValue> duplicate{ NullifierLeafValue(FF(9)), NullifierLeafValue(FF(9)) };
    EXPECT_THROW(batch.batch_insert_nullifiers(CANONICAL, duplicate, 1), std::runtime_error);
}

// A duplicate nullifier fails with aztec-wsdb's message, which names the tree: callers match on it (an aztec-nr test
// expects "NullifierTree" from a contract deployed twice).
TEST(ReferenceWorldState, DuplicateNullifiersNameTheTreeAsAztecWsdbDoes)
{
    auto message_of = [](auto&& insert) {
        try {
            insert();
        } catch (const std::runtime_error& e) {
            return std::string(e.what());
        }
        return std::string("no error");
    };
    ReferenceWorldState ws;
    std::vector<NullifierLeafValue> leaves{ NullifierLeafValue(FF(0x1234)) };
    ws.sequential_insert_nullifiers(CANONICAL, leaves);
    const std::string expected = "Unable to insert values into tree NullifierTree leaf type NullifierLeafValue is not "
                                 "updateable and ";
    EXPECT_EQ(message_of([&] { ws.sequential_insert_nullifiers(CANONICAL, leaves); }).rfind(expected, 0), 0U);
    EXPECT_EQ(message_of([&] { ws.batch_insert_nullifiers(CANONICAL, leaves, 0); }).rfind(expected, 0), 0U);
}

TEST(ReferenceWorldState, PublicDataUpdatesInPlace)
{
    ReferenceWorldState ws;
    ws.sequential_insert_public_data(CANONICAL, std::vector{ PublicDataLeafValue(FF(5000), FF(1)) });
    auto size_after_insert = size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::PUBLIC_DATA_TREE);
    auto update = ws.sequential_insert_public_data(CANONICAL, std::vector{ PublicDataLeafValue(FF(5000), FF(2)) });
    EXPECT_EQ(size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::PUBLIC_DATA_TREE), size_after_insert);
    ASSERT_EQ(update.insertion_witness_data.size(), 1);
    EXPECT_EQ(update.insertion_witness_data[0].path, SiblingPath(PUBLIC_DATA_TREE_HEIGHT, FF::zero()));
    auto index = ws.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::PUBLIC_DATA_TREE, FF(5000), 0);
    ASSERT_TRUE(index.has_value());
    EXPECT_EQ(ws.get_public_data_preimage(LATEST_UNCOMMITTED, *index)->leaf.value, FF(2));
}

TEST(ReferenceWorldState, CheckpointsRevertAndCommit)
{
    ReferenceWorldState ws;
    ws.create_checkpoint(CANONICAL);
    ws.append_leaves(CANONICAL, MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(1) });
    ws.create_checkpoint(CANONICAL);
    ws.append_leaves(CANONICAL, MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(2) });
    ws.revert_checkpoint(CANONICAL);
    EXPECT_EQ(size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE), 1);
    ws.commit_checkpoint(CANONICAL);
    EXPECT_THROW(ws.commit_checkpoint(CANONICAL), std::runtime_error);
    EXPECT_EQ(size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE), 1);

    ws.create_checkpoint(CANONICAL);
    ws.create_checkpoint(CANONICAL);
    ws.append_leaves(CANONICAL, MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(3) });
    ws.revert_all_checkpoints(CANONICAL);
    EXPECT_THROW(ws.revert_checkpoint(CANONICAL), std::runtime_error);
    EXPECT_EQ(size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE), 1);

    ws.rollback();
    EXPECT_EQ(size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::NOTE_HASH_TREE), 0);
}

TEST(ReferenceWorldState, UpdateArchiveRequiresTheCurrentState)
{
    ReferenceWorldState ws;
    ws.append_leaves(CANONICAL, MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ FF(7) });
    auto current = ws.get_state_reference(LATEST_UNCOMMITTED);
    EXPECT_THROW(ws.update_archive(CANONICAL, ws.get_initial_state_reference(), FF(99)), std::runtime_error);
    // Order is not part of the contract.
    std::reverse(current.begin(), current.end());
    ws.update_archive(CANONICAL, current, FF(99));
    EXPECT_EQ(size_of(ws, LATEST_UNCOMMITTED, MerkleTreeId::ARCHIVE), 2);
    EXPECT_EQ(ws.get_leaf_value(LATEST_UNCOMMITTED, MerkleTreeId::ARCHIVE, 1), FF(99));
    EXPECT_EQ(ws.find_leaf_index(LATEST_UNCOMMITTED, MerkleTreeId::ARCHIVE, FF(99), 0), 1);
}

// wasm does not find main() in gtest_main (see ecc_tests' secp256r1.test.cpp).
#ifdef __wasm__
GTEST_API_ int main(int argc, char** argv)
{
    testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
#endif
