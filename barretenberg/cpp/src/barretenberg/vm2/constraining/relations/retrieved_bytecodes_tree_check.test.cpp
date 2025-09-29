#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/gadgets/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/test_tree.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::NiceMock;

using simulation::build_retrieved_bytecodes_tree;
using simulation::ClassIdLeafValue;
using simulation::DeduplicatingEventEmitter;
using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::MockRangeCheck;
using simulation::NoopEventEmitter;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using simulation::RetrievedBytecodesTree;
using simulation::RetrievedBytecodesTreeCheck;
using simulation::RetrievedBytecodesTreeCheckEvent;
using simulation::RetrievedBytecodesTreeLeafPreimage;

using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::MerkleCheckTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::RetrievedBytecodesTreeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using retrieved_bytecodes_tree = bb::avm2::retrieved_bytecodes_tree_check<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

class RetrievedBytecodesTreeCheckConstrainingTest : public ::testing::Test {
  protected:
    RetrievedBytecodesTreeCheckConstrainingTest() = default;

    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    // Interactions involve the poseidon2 hash, so the others can be noop
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    NoopEventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    NiceMock<MockGreaterThan> mock_gt;
    NiceMock<MockExecutionIdManager> mock_execution_id_manager;

    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
};

TEST_F(RetrievedBytecodesTreeCheckConstrainingTest, EmptyRow)
{
    check_relation<retrieved_bytecodes_tree>(testing::empty_trace());
}

struct TestParams {
    FF class_id;
    bool exists;
    std::vector<ClassIdLeafValue> pre_existing_leaves;
};

std::vector<TestParams> positive_read_tests = {
    // Exists = true, leaf pointers to infinity
    TestParams{ .class_id = 42, .exists = true, .pre_existing_leaves = { { ClassIdLeafValue(42) } } },
    // Exists = true, leaf points to higher value
    TestParams{
        .class_id = 42, .exists = true, .pre_existing_leaves = { { ClassIdLeafValue(42), ClassIdLeafValue(42 + 1) } } },
    // Exists = false, low leaf points to infinity
    TestParams{ .class_id = 42, .exists = false, .pre_existing_leaves = { {} } },
    // Exists = false, low leaf points to higher value
    TestParams{ .class_id = 42, .exists = false, .pre_existing_leaves = { { ClassIdLeafValue(42 + 1) } } }
};

class RetrievedBytecodesReadPositiveTests : public RetrievedBytecodesTreeCheckConstrainingTest,
                                            public ::testing::WithParamInterface<TestParams> {};

TEST_P(RetrievedBytecodesReadPositiveTests, Positive)
{
    const auto& param = GetParam();

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<RetrievedBytecodesTreeCheckEvent> retrieved_bytecodes_tree_event_emitter;

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });

    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    RetrievedBytecodesTreeCheckTraceBuilder retrieved_bytecodes_tree_builder;

    RetrievedBytecodesTree initial_state = build_retrieved_bytecodes_tree();
    initial_state.insert_indexed_leaves(param.pre_existing_leaves);

    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_simulator(
        poseidon2, merkle_check, field_gt, initial_state, retrieved_bytecodes_tree_event_emitter);

    retrieved_bytecodes_tree_simulator.contains(param.class_id);

    retrieved_bytecodes_tree_builder.process(retrieved_bytecodes_tree_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);

    check_relation<retrieved_bytecodes_tree>(trace);
    check_all_interactions<RetrievedBytecodesTreeCheckTraceBuilder>(trace);
}

INSTANTIATE_TEST_SUITE_P(RetrievedBytecodesTreeCheckConstrainingTest,
                         RetrievedBytecodesReadPositiveTests,
                         ::testing::ValuesIn(positive_read_tests));

TEST_F(RetrievedBytecodesTreeCheckConstrainingTest, PositiveWriteAppend)
{
    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<RetrievedBytecodesTreeCheckEvent> retrieved_bytecodes_tree_event_emitter;

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });

    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    RetrievedBytecodesTreeCheckTraceBuilder retrieved_bytecodes_tree_builder;

    FF class_id = 100;

    RetrievedBytecodesTree initial_state = build_retrieved_bytecodes_tree();

    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_simulator(
        poseidon2, merkle_check, field_gt, initial_state, retrieved_bytecodes_tree_event_emitter);

    retrieved_bytecodes_tree_simulator.insert(class_id);

    retrieved_bytecodes_tree_builder.process(retrieved_bytecodes_tree_event_emitter.dump_events(), trace);

    EXPECT_EQ(trace.get_num_rows(), 1);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);

    check_relation<retrieved_bytecodes_tree>(trace);
    check_all_interactions<RetrievedBytecodesTreeCheckTraceBuilder>(trace);
}

TEST_F(RetrievedBytecodesTreeCheckConstrainingTest, PositiveWriteMembership)
{
    FF class_id = 42;
    auto low_leaf = RetrievedBytecodesTreeLeafPreimage(ClassIdLeafValue(class_id), 0, 0);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<RetrievedBytecodesTreeCheckEvent> retrieved_bytecodes_tree_event_emitter;

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });

    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    RetrievedBytecodesTreeCheckTraceBuilder retrieved_bytecodes_tree_builder;

    RetrievedBytecodesTree initial_state = build_retrieved_bytecodes_tree();
    initial_state.insert_indexed_leaves({ { ClassIdLeafValue(class_id) } });

    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_simulator(
        poseidon2, merkle_check, field_gt, initial_state, retrieved_bytecodes_tree_event_emitter);

    retrieved_bytecodes_tree_simulator.insert(class_id);

    retrieved_bytecodes_tree_builder.process(retrieved_bytecodes_tree_event_emitter.dump_events(), trace);

    EXPECT_EQ(trace.get_num_rows(), 1);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);

    check_relation<retrieved_bytecodes_tree>(trace);
    check_all_interactions<RetrievedBytecodesTreeCheckTraceBuilder>(trace);
}

TEST_F(RetrievedBytecodesTreeCheckConstrainingTest, NegativeExistsFlagCheck)
{
    // Test constraint: sel * (CLASS_ID_LOW_LEAF_CLASS_ID_DIFF * (EXISTS * (1 - class_id_low_leaf_class_id_diff_inv)
    // + class_id_low_leaf_class_id_diff_inv) - 1 + EXISTS) = 0
    TestTraceContainer trace({
        { { C::retrieved_bytecodes_tree_check_sel, 1 },
          { C::retrieved_bytecodes_tree_check_class_id, 27 },
          { C::retrieved_bytecodes_tree_check_low_leaf_class_id, 27 },
          { C::retrieved_bytecodes_tree_check_class_id_low_leaf_class_id_diff_inv, 0 },
          { C::retrieved_bytecodes_tree_check_leaf_not_exists, 0 } },
        { { C::retrieved_bytecodes_tree_check_sel, 1 },
          { C::retrieved_bytecodes_tree_check_class_id, 28 },
          { C::retrieved_bytecodes_tree_check_low_leaf_class_id, 27 },
          { C::retrieved_bytecodes_tree_check_class_id_low_leaf_class_id_diff_inv, FF(1).invert() },
          { C::retrieved_bytecodes_tree_check_leaf_not_exists, 1 } },
    });

    check_relation<retrieved_bytecodes_tree>(trace, retrieved_bytecodes_tree::SR_EXISTS_CHECK);
    trace.set(C::retrieved_bytecodes_tree_check_leaf_not_exists, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<retrieved_bytecodes_tree>(trace, retrieved_bytecodes_tree::SR_EXISTS_CHECK), "EXISTS_CHECK");
    trace.set(C::retrieved_bytecodes_tree_check_leaf_not_exists, 0, 0);
    trace.set(C::retrieved_bytecodes_tree_check_leaf_not_exists, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<retrieved_bytecodes_tree>(trace, retrieved_bytecodes_tree::SR_EXISTS_CHECK), "EXISTS_CHECK");
}

TEST_F(RetrievedBytecodesTreeCheckConstrainingTest, NegativeNextSlotIsZero)
{
    // Test constraint: leaf_not_exists * (low_leaf_next_class_id * (NEXT_CLASS_ID_IS_ZERO * (1 - next_class_id_inv) +
    // next_class_id_inv) - 1 + NEXT_CLASS_ID_IS_ZERO) = 0;

    TestTraceContainer trace({
        {
            { C::retrieved_bytecodes_tree_check_leaf_not_exists, 1 },
            { C::retrieved_bytecodes_tree_check_low_leaf_next_class_id, 0 },
            { C::retrieved_bytecodes_tree_check_next_class_id_inv, 0 },
            { C::retrieved_bytecodes_tree_check_next_class_id_is_nonzero, 0 },
        },
        {
            { C::retrieved_bytecodes_tree_check_leaf_not_exists, 1 },
            { C::retrieved_bytecodes_tree_check_low_leaf_next_class_id, 1 },
            { C::retrieved_bytecodes_tree_check_next_class_id_inv, FF(1).invert() },
            { C::retrieved_bytecodes_tree_check_next_class_id_is_nonzero, 1 },
        },
    });

    check_relation<retrieved_bytecodes_tree>(trace, retrieved_bytecodes_tree::SR_NEXT_CLASS_ID_IS_ZERO_CHECK);

    trace.set(C::retrieved_bytecodes_tree_check_next_class_id_is_nonzero, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<retrieved_bytecodes_tree>(trace, retrieved_bytecodes_tree::SR_NEXT_CLASS_ID_IS_ZERO_CHECK),
        "NEXT_CLASS_ID_IS_ZERO_CHECK");

    trace.set(C::retrieved_bytecodes_tree_check_next_class_id_is_nonzero, 0, 0);
    trace.set(C::retrieved_bytecodes_tree_check_next_class_id_is_nonzero, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<retrieved_bytecodes_tree>(trace, retrieved_bytecodes_tree::SR_NEXT_CLASS_ID_IS_ZERO_CHECK),
        "NEXT_CLASS_ID_IS_ZERO_CHECK");
}

} // namespace
} // namespace bb::avm2::constraining
