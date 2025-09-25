#include "barretenberg/vm2/simulation/gadgets/retrieved_bytecodes_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/retrieved_bytecodes_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/lib/retrieved_bytecodes_tree.hpp"
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

TEST(AvmSimulationRetrievedBytecodesTreeCheck, ContainsNotExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<RetrievedBytecodesTreeCheckEvent> event_emitter;

    FF class_id = 42;
    RetrievedBytecodesTree initial_state = build_retrieved_bytecodes_tree();

    // Prefill will point to our new leaf
    ASSERT_EQ(initial_state.get_snapshot().nextAvailableLeafIndex, 1);
    uint64_t low_leaf_index = 0;
    RetrievedBytecodesTreeLeafPreimage low_leaf = initial_state.get_leaf_preimage(low_leaf_index);

    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());

    auto sibling_path = initial_state.get_sibling_path(0);
    auto snapshot = initial_state.get_snapshot();

    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(class_id, low_leaf.leaf.class_id)).WillRepeatedly(Return(true));

    EXPECT_FALSE(retrieved_bytecodes_tree_check.contains(class_id));

    RetrievedBytecodesTreeCheckEvent expect_event = {
        .class_id = class_id,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationRetrievedBytecodesTree, ContainsExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<RetrievedBytecodesTreeCheckEvent> event_emitter;
    RetrievedBytecodesTree initial_state = build_retrieved_bytecodes_tree();

    FF class_id = 42;

    uint64_t low_leaf_index = initial_state.get_snapshot().nextAvailableLeafIndex;
    initial_state.insert_indexed_leaves({ { ClassIdLeafValue(class_id) } });

    RetrievedBytecodesTreeLeafPreimage low_leaf = initial_state.get_leaf_preimage(low_leaf_index);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    std::vector<FF> sibling_path = initial_state.get_sibling_path(low_leaf_index);
    auto snapshot = initial_state.get_snapshot();

    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    EXPECT_TRUE(retrieved_bytecodes_tree_check.contains(class_id));

    RetrievedBytecodesTreeCheckEvent expect_event = {
        .class_id = class_id,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationRetrievedBytecodesTree, ReadNotExistsLowPointsToAnotherLeaf)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<RetrievedBytecodesTreeCheckEvent> event_emitter;

    RetrievedBytecodesTree initial_state = build_retrieved_bytecodes_tree();
    // Prefill now points to leaf MAX
    initial_state.insert_indexed_leaves({ { ClassIdLeafValue(FF::neg_one()) } });

    FF class_id = 42;

    auto low_leaf = initial_state.get_leaf_preimage(0);

    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 0;
    std::vector<FF> sibling_path = initial_state.get_sibling_path(low_leaf_index);
    AppendOnlyTreeSnapshot snapshot = initial_state.get_snapshot();

    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(class_id, low_leaf.leaf.class_id)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, class_id)).WillRepeatedly(Return(true));

    retrieved_bytecodes_tree_check.contains(class_id);

    RetrievedBytecodesTreeCheckEvent expect_event = {
        .class_id = class_id,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationRetrievedBytecodesTree, InsertExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<RetrievedBytecodesTreeCheckEvent> event_emitter;

    FF class_id = 42;

    RetrievedBytecodesTree initial_state = build_retrieved_bytecodes_tree();
    uint64_t low_leaf_index = initial_state.get_snapshot().nextAvailableLeafIndex;
    initial_state.insert_indexed_leaves({ { ClassIdLeafValue(class_id) } });

    RetrievedBytecodesTreeLeafPreimage low_leaf = initial_state.get_leaf_preimage(low_leaf_index);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    std::vector<FF> sibling_path = initial_state.get_sibling_path(low_leaf_index);
    AppendOnlyTreeSnapshot snapshot = initial_state.get_snapshot();

    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(FF(low_leaf_hash)));
    EXPECT_CALL(merkle_check, assert_membership(low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    retrieved_bytecodes_tree_check.insert(class_id);

    EXPECT_EQ(retrieved_bytecodes_tree_check.get_snapshot(), snapshot);

    RetrievedBytecodesTreeCheckEvent expect_event = {
        .class_id = class_id,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .low_leaf_preimage = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write = true,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationRetrievedBytecodesTree, InsertAppend)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<RetrievedBytecodesTreeCheckEvent> event_emitter;

    FF class_id = 100;

    RetrievedBytecodesTree initial_state = build_retrieved_bytecodes_tree();
    // Prefill will point to our new leaf
    ASSERT_EQ(initial_state.get_snapshot().nextAvailableLeafIndex, 1);
    uint64_t low_leaf_index = 0;
    uint64_t new_leaf_index = 1;
    RetrievedBytecodesTreeLeafPreimage low_leaf = initial_state.get_leaf_preimage(low_leaf_index);

    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    RetrievedBytecodesTree state_after_insert = initial_state;
    state_after_insert.insert_indexed_leaves({ { ClassIdLeafValue(class_id) } });

    std::vector<FF> low_leaf_sibling_path = initial_state.get_sibling_path(low_leaf_index);

    RetrievedBytecodesTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = new_leaf_index;
    updated_low_leaf.nextKey = class_id;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());

    FF intermediate_root = unconstrained_root_from_path(updated_low_leaf_hash, low_leaf_index, low_leaf_sibling_path);
    std::vector<FF> insertion_sibling_path = state_after_insert.get_sibling_path(new_leaf_index);

    RetrievedBytecodesTreeLeafPreimage new_leaf =
        RetrievedBytecodesTreeLeafPreimage(ClassIdLeafValue(class_id), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());

    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check(
        poseidon2, merkle_check, field_gt, initial_state, event_emitter);

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) {
        return RawPoseidon2::hash(input);
    });
    EXPECT_CALL(merkle_check,
                write(low_leaf_hash, updated_low_leaf_hash, low_leaf_index, _, initial_state.get_snapshot().root))
        .WillRepeatedly(Return(intermediate_root));
    EXPECT_CALL(field_gt, ff_gt(class_id, low_leaf.leaf.class_id)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.nextKey, class_id)).WillRepeatedly(Return(true));
    EXPECT_CALL(merkle_check, write(FF(0), new_leaf_hash, new_leaf_index, _, intermediate_root))
        .WillRepeatedly(Return(state_after_insert.get_snapshot().root));

    retrieved_bytecodes_tree_check.insert(class_id);

    EXPECT_EQ(retrieved_bytecodes_tree_check.get_snapshot(), state_after_insert.get_snapshot());

    RetrievedBytecodesTreeCheckEvent expect_event = { .class_id = class_id,
                                                      .prev_snapshot = initial_state.get_snapshot(),
                                                      .next_snapshot = state_after_insert.get_snapshot(),
                                                      .low_leaf_preimage = low_leaf,
                                                      .low_leaf_hash = low_leaf_hash,
                                                      .low_leaf_index = low_leaf_index,
                                                      .write = true,
                                                      .append_data = RetrievedBytecodeAppendData{
                                                          .updated_low_leaf_hash = updated_low_leaf_hash,
                                                          .new_leaf_hash = new_leaf_hash,
                                                          .intermediate_root = intermediate_root,
                                                      } };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

} // namespace

} // namespace bb::avm2::simulation
