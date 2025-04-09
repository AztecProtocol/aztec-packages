#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"

#include "gmock/gmock.h"
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/nullifier_tree_read_event.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::StrictMock;

using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

namespace {

TEST(AvmSimulationNullifierTree, Exists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeReadEvent> event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    NullifierTreeLeafPreimage low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(42), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    FF root = 123456;
    FF nullifier = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, root)).WillRepeatedly(Return());

    nullifier_tree_check.assert_read(nullifier, true, low_leaf, low_leaf_index, sibling_path, root);

    NullifierTreeReadEvent expect_event = {
        .nullifier = nullifier,
        .root = root,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: nullifier does not exist
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(nullifier, false, low_leaf, low_leaf_index, sibling_path, root),
        "Nullifier non-membership check failed");
}

TEST(AvmSimulationNullifierTree, NotExistsLowPointsToInfinity)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeReadEvent> event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    NullifierTreeLeafPreimage low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(40), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    FF root = 123456;
    FF nullifier = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, root)).WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(nullifier, low_leaf.leaf.nullifier)).WillRepeatedly(Return(true));

    nullifier_tree_check.assert_read(nullifier, false, low_leaf, low_leaf_index, sibling_path, root);
    NullifierTreeReadEvent expect_event = {
        .nullifier = nullifier,
        .root = root,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: nullifier exists
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(nullifier, true, low_leaf, low_leaf_index, sibling_path, root),
        "Nullifier membership check failed");

    // Negative test: failed nullifier > low_leaf_preimage.value.nullifier
    EXPECT_CALL(field_gt, ff_gt(nullifier, low_leaf.leaf.nullifier)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(nullifier, true, low_leaf, low_leaf_index, sibling_path, root),
        "Low leaf slot is GTE leaf slot");
}

TEST(AvmSimulationNullifierTree, NotExistsLowPointsToAnotherLeaf)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeReadEvent> event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    NullifierTreeLeafPreimage low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(40), 28, 50);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    FF root = 123456;
    FF nullifier = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, root)).WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(nullifier, low_leaf.leaf.nullifier)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, nullifier)).WillRepeatedly(Return(true));

    nullifier_tree_check.assert_read(nullifier, false, low_leaf, low_leaf_index, sibling_path, root);
    NullifierTreeReadEvent expect_event = {
        .nullifier = nullifier,
        .root = root,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: nullifier exists
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(nullifier, true, low_leaf, low_leaf_index, sibling_path, root),
        "Nullifier membership check failed");

    // Negative test: failed low_leaf_preimage.nextKey > nullifier
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, nullifier)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(nullifier, true, low_leaf, low_leaf_index, sibling_path, root),
        "Leaf slot is GTE low leaf next slot");
}

} // namespace

} // namespace bb::avm2::simulation
