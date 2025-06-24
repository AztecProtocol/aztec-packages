#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/nullifier_tree_check_event.hpp"
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

TEST(AvmSimulationNullifierTree, ReadExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeCheckEvent> event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    NullifierTreeLeafPreimage low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(42), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = AppendOnlyTreeSnapshot{ .root = 123456, .nextAvailableLeafIndex = 128 };

    FF nullifier = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    nullifier_tree_check.assert_read(
        nullifier, /*contract_address*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot);

    NullifierTreeReadWriteEvent expect_event = {
        .nullifier = nullifier,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: nullifier does not exist
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(
            nullifier, /*contract_address*/ std::nullopt, false, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Nullifier non-membership check failed");
}

TEST(AvmSimulationNullifierTree, ReadNotExistsLowPointsToInfinity)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeCheckEvent> event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    NullifierTreeLeafPreimage low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(40), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = AppendOnlyTreeSnapshot{ .root = 123456, .nextAvailableLeafIndex = 128 };
    FF nullifier = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(nullifier, low_leaf.leaf.nullifier)).WillRepeatedly(Return(true));

    nullifier_tree_check.assert_read(
        nullifier, /*contract_address*/ std::nullopt, false, low_leaf, low_leaf_index, sibling_path, snapshot);
    NullifierTreeReadWriteEvent expect_event = {
        .nullifier = nullifier,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: nullifier exists
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(
            nullifier, /*contract_address*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Nullifier membership check failed");

    // Negative test: failed nullifier > low_leaf_preimage.value.nullifier
    EXPECT_CALL(field_gt, ff_gt(nullifier, low_leaf.leaf.nullifier)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(
            nullifier, /*contract_address*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Low leaf value is GTE leaf value");
}

TEST(AvmSimulationNullifierTree, ReadNotExistsLowPointsToAnotherLeaf)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeCheckEvent> event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    NullifierTreeLeafPreimage low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(40), 28, 50);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = AppendOnlyTreeSnapshot{ .root = 123456, .nextAvailableLeafIndex = 128 };
    FF nullifier = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(nullifier, low_leaf.leaf.nullifier)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, nullifier)).WillRepeatedly(Return(true));

    nullifier_tree_check.assert_read(
        nullifier, /*contract_address*/ std::nullopt, false, low_leaf, low_leaf_index, sibling_path, snapshot);
    NullifierTreeReadWriteEvent expect_event = {
        .nullifier = nullifier,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: nullifier exists
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(
            nullifier, /*contract_address*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Nullifier membership check failed");

    // Negative test: failed low_leaf_preimage.nextKey > nullifier
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, nullifier)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        nullifier_tree_check.assert_read(
            nullifier, /*contract_address*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Leaf value is GTE low leaf next value");
}

TEST(AvmSimulationNullifierTree, WriteExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeCheckEvent> event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    NullifierTreeLeafPreimage low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(42), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = AppendOnlyTreeSnapshot{ .root = 123456, .nextAvailableLeafIndex = 128 };

    FF nullifier = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    AppendOnlyTreeSnapshot result_snapshot = nullifier_tree_check.write(nullifier,
                                                                        /*contract_address*/ std::nullopt,
                                                                        10,
                                                                        low_leaf,
                                                                        low_leaf_index,
                                                                        sibling_path,
                                                                        snapshot,
                                                                        /*insertion_path*/ std::nullopt);

    EXPECT_EQ(result_snapshot, snapshot);

    NullifierTreeReadWriteEvent expect_event = {
        .nullifier = nullifier,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write = true,
        .nullifier_counter = 10,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationNullifierTree, Siloing)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeCheckEvent> event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    FF nullifier = 42;
    AztecAddress contract_address = AztecAddress(1);
    std::vector<FF> siloed_nullifier_hash_inputs = { GENERATOR_INDEX__OUTER_NULLIFIER, contract_address, nullifier };
    FF siloed_nullifier = RawPoseidon2::hash(siloed_nullifier_hash_inputs);

    NullifierTreeLeafPreimage low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(siloed_nullifier), 0, 0);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = AppendOnlyTreeSnapshot{ .root = 123456, .nextAvailableLeafIndex = 128 };

    EXPECT_CALL(poseidon2, hash(siloed_nullifier_hash_inputs)).WillRepeatedly(Return(FF(siloed_nullifier)));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    nullifier_tree_check.assert_read(nullifier, contract_address, 10, low_leaf, low_leaf_index, sibling_path, snapshot);

    NullifierTreeReadWriteEvent expect_event = {
        .nullifier = nullifier,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .siloing_data = NullifierSiloingData{ .siloed_nullifier = siloed_nullifier, .address = contract_address },
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationNullifierTree, WriteAppend)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeCheckEvent> event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, event_emitter);

    FF nullifier = 100;
    FF low_nullifier = 40;

    MemoryTree<Poseidon2HashPolicy> nullifier_tree(8);

    NullifierTreeLeafPreimage low_leaf =
        NullifierTreeLeafPreimage(NullifierLeafValue(low_nullifier), 10, nullifier + 1);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 0;
    nullifier_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = nullifier_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = nullifier_tree.get_sibling_path(low_leaf_index);

    NullifierTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf.nextKey = nullifier;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    nullifier_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    FF intermediate_root = nullifier_tree.root();
    std::vector<FF> insertion_sibling_path = nullifier_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    NullifierTreeLeafPreimage new_leaf =
        NullifierTreeLeafPreimage(NullifierLeafValue(nullifier), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());
    nullifier_tree.update_element(prev_snapshot.nextAvailableLeafIndex, new_leaf_hash);

    AppendOnlyTreeSnapshot next_snapshot =
        AppendOnlyTreeSnapshot{ .root = nullifier_tree.root(),
                                .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1 };

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) {
        return RawPoseidon2::hash(input);
    });
    EXPECT_CALL(merkle_check, write(low_leaf_hash, updated_low_leaf_hash, low_leaf_index, _, prev_snapshot.root))
        .WillRepeatedly(Return(intermediate_root));
    EXPECT_CALL(field_gt, ff_gt(nullifier, low_leaf.leaf.nullifier)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, nullifier)).WillRepeatedly(Return(true));
    EXPECT_CALL(merkle_check, write(FF(0), new_leaf_hash, prev_snapshot.nextAvailableLeafIndex, _, intermediate_root))
        .WillRepeatedly(Return(next_snapshot.root));

    AppendOnlyTreeSnapshot result_snapshot = nullifier_tree_check.write(nullifier,
                                                                        /*contract_address*/ std::nullopt,
                                                                        0,
                                                                        low_leaf,
                                                                        low_leaf_index,
                                                                        low_leaf_sibling_path,
                                                                        prev_snapshot,
                                                                        insertion_sibling_path);

    EXPECT_EQ(next_snapshot, result_snapshot);

    NullifierTreeReadWriteEvent expect_event = { .nullifier = nullifier,
                                                 .prev_snapshot = prev_snapshot,
                                                 .next_snapshot = next_snapshot,
                                                 .low_leaf_preimage = low_leaf,
                                                 .low_leaf_hash = low_leaf_hash,
                                                 .low_leaf_index = low_leaf_index,
                                                 .write = true,
                                                 .append_data = NullifierAppendData{
                                                     .updated_low_leaf_hash = updated_low_leaf_hash,
                                                     .new_leaf_hash = new_leaf_hash,
                                                     .intermediate_root = intermediate_root,
                                                 } };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: nullifier exists
    low_leaf.leaf.nullifier = nullifier;
    EXPECT_THROW_WITH_MESSAGE(nullifier_tree_check.write(nullifier,
                                                         /*contract_address*/ std::nullopt,
                                                         0,
                                                         low_leaf,
                                                         low_leaf_index,
                                                         low_leaf_sibling_path,
                                                         prev_snapshot,
                                                         insertion_sibling_path),
                              "Nullifier non-membership check failed");
    low_leaf.leaf.nullifier = low_nullifier;

    // Negative test: failed nullifier > low_leaf_preimage.value.nullifier
    EXPECT_CALL(field_gt, ff_gt(nullifier, low_leaf.leaf.nullifier)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(nullifier_tree_check.write(nullifier,
                                                         /*contract_address*/ std::nullopt,
                                                         0,
                                                         low_leaf,
                                                         low_leaf_index,
                                                         low_leaf_sibling_path,
                                                         prev_snapshot,
                                                         insertion_sibling_path),
                              "Low leaf value is GTE leaf value");
    EXPECT_CALL(field_gt, ff_gt(nullifier, low_leaf.leaf.nullifier)).WillOnce(Return(true));

    // Negative test: failed low_leaf_preimage.nextKey > nullifier
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, nullifier)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(nullifier_tree_check.write(nullifier,
                                                         /*contract_address*/ std::nullopt,
                                                         0,
                                                         low_leaf,
                                                         low_leaf_index,
                                                         low_leaf_sibling_path,
                                                         prev_snapshot,
                                                         insertion_sibling_path),
                              "Leaf value is GTE low leaf next value");
}

} // namespace

} // namespace bb::avm2::simulation
