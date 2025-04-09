#include "barretenberg/vm2/simulation/public_data_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_read_event.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

#include "gmock/gmock.h"
#include <gtest/gtest.h>

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::AllOf;
using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::SizeIs;
using ::testing::StrictMock;

using PublicDataLeafValue = crypto::merkle_tree::PublicDataLeafValue;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

namespace {

TEST(AvmSimulationPublicDataTree, Exists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<PublicDataTreeReadEvent> event_emitter;
    PublicDataTreeCheck public_data_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(42, 27), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    FF root = 123456;
    FF leaf_slot = 42;
    FF value = 27;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, root)).WillRepeatedly(Return());

    public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, root);

    PublicDataTreeReadEvent expect_event = {
        .value = value,
        .slot = leaf_slot,
        .root = root,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: wrong value
    value = 28;
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, root),
        "Leaf value does not match value");
}

TEST(AvmSimulationPublicDataTree, NotExistsLowPointsToInfinity)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<PublicDataTreeReadEvent> event_emitter;
    PublicDataTreeCheck public_data_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(40, 27), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    FF root = 123456;
    FF leaf_slot = 42;
    FF value = 0;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, root)).WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));

    public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, root);
    PublicDataTreeReadEvent expect_event = {
        .value = value,
        .slot = leaf_slot,
        .root = root,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: wrong value
    value = 1;
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, root),
        "Value is nonzero for a non existing slot");

    // Negative test: failed leaf_slot > low_leaf_preimage.value.slot
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, root),
        "Low leaf slot is GTE leaf slot");
}

TEST(AvmSimulationPublicDataTree, NotExistsLowPointsToAnotherLeaf)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<PublicDataTreeReadEvent> event_emitter;
    PublicDataTreeCheck public_data_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(40, 27), 28, 50);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    FF root = 123456;
    FF leaf_slot = 42;
    FF value = 0;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, root)).WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(leaf_slot, low_leaf.leaf.slot)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, leaf_slot)).WillRepeatedly(Return(true));

    public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, root);
    PublicDataTreeReadEvent expect_event = {
        .value = value,
        .slot = leaf_slot,
        .root = root,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: wrong value
    value = 1;
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, root),
        "Value is nonzero for a non existing slot");

    // Negative test: failed low_leaf_preimage.nextValue > leaf_slot
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, leaf_slot)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        public_data_tree_check.assert_read(leaf_slot, value, low_leaf, low_leaf_index, sibling_path, root),
        "Leaf slot is GTE low leaf next slot");
}

} // namespace

} // namespace bb::avm2::simulation
