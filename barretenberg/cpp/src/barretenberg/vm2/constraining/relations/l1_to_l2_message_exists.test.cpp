#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/l1_to_l2_message_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_l1_to_l2_message_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/l1_to_l2_message_tree_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::GreaterThanTraceBuilder;
using tracegen::L1ToL2MessageTreeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using simulation::EventEmitter;
using simulation::GreaterThan;
using simulation::GreaterThanEvent;
using simulation::L1ToL2MessageTreeCheck;
using simulation::L1ToL2MessageTreeCheckEvent;
using simulation::MockFieldGreaterThan;
using simulation::MockMerkleCheck;
using simulation::MockRangeCheck;

using testing::NiceMock;

using FF = AvmFlavorSettings::FF;
using C = Column;
using l1_to_l2_message_exists = bb::avm2::l1_to_l2_message_exists<FF>;

TEST(L1ToL2MessageExistsConstrainingTest, PositiveExists)
{
    TestTraceContainer trace({
        { { C::execution_sel_execute_l1_to_l2_message_exists, 1 },
          { C::execution_register_0_, /*msg_hash=*/42 },
          { C::execution_register_1_, /*leaf_index=*/27 },
          { C::execution_register_2_, /*dst=*/1 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U64) },
          { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
          { C::execution_l1_to_l2_msg_leaf_in_range, 1 },
          { C::execution_l1_to_l2_msg_tree_leaf_count, static_cast<uint64_t>(L1_TO_L2_MSG_TREE_LEAF_COUNT) },
          { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_L1_TO_L2_MESSAGE_EXISTS } },
    });
    check_relation<l1_to_l2_message_exists>(trace);
}

TEST(L1ToL2MessageExistsConstrainingTest, OutOfRange)
{
    uint64_t leaf_index = L1_TO_L2_MSG_TREE_LEAF_COUNT + 1;
    TestTraceContainer trace({
        { { C::execution_sel_execute_l1_to_l2_message_exists, 1 },
          { C::execution_register_0_, /*msg_hash=*/42 },
          { C::execution_register_1_, /*leaf_index=*/leaf_index },
          { C::execution_register_2_, /*dst=*/0 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U64) },
          { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
          { C::execution_l1_to_l2_msg_leaf_in_range, 0 },
          { C::execution_l1_to_l2_msg_tree_leaf_count, static_cast<uint64_t>(L1_TO_L2_MSG_TREE_LEAF_COUNT) },
          { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_L1_TO_L2_MESSAGE_EXISTS } },
    });

    check_relation<l1_to_l2_message_exists>(trace);

    // Negative test: exists must be false
    trace.set(C::execution_register_2_, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<l1_to_l2_message_exists>(trace), "L1_TO_L2_MSG_EXISTS_OUT_OF_RANGE_FALSE");
}

TEST(L1ToL2MessageExistsConstrainingTest, NegativeInvalidOutputTag)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_l1_to_l2_message_exists, 1 },
        { C::execution_register_0_, /*msg_hash=*/42 },
        { C::execution_register_1_, /*leaf_index=*/27 },
        { C::execution_register_2_, /*dst=*/1 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U64) },
        { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U8) },
    } });
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<l1_to_l2_message_exists>(trace, l1_to_l2_message_exists::SR_L1_TO_L2_MSG_EXISTS_U1_OUTPUT_TAG),
        "L1_TO_L2_MSG_EXISTS_U1_OUTPUT_TAG");
}

TEST(L1ToL2MessageExistsConstrainingTest, NegativeL1ToL2MessageExistsSuccess)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_l1_to_l2_message_exists, 1 },
        { C::execution_sel_opcode_error, 1 },
    } });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<l1_to_l2_message_exists>(trace, l1_to_l2_message_exists::SR_L1_TO_L2_MSG_EXISTS_SUCCESS),
        "L1_TO_L2_MSG_EXISTS_SUCCESS");
}

TEST(L1ToL2MessageExistsConstrainingTest, Interactions)
{
    NiceMock<MockMerkleCheck> merkle_check;
    NiceMock<MockFieldGreaterThan> field_gt;
    NiceMock<MockRangeCheck> range_check;

    EventEmitter<GreaterThanEvent> greater_than_event_emitter;
    GreaterThan greater_than(field_gt, range_check, greater_than_event_emitter);
    EventEmitter<L1ToL2MessageTreeCheckEvent> l1_to_l2_message_tree_check_event_emitter;
    L1ToL2MessageTreeCheck l1_to_l2_message_tree_check(merkle_check, l1_to_l2_message_tree_check_event_emitter);

    FF requested_msg_hash = 42;
    FF actual_leaf_value = 43;

    uint64_t leaf_index = 27;

    AppendOnlyTreeSnapshot l1_to_l2_message_tree_snapshot = AppendOnlyTreeSnapshot{
        .root = 42,
        .nextAvailableLeafIndex = 128,
    };

    greater_than.gt(L1_TO_L2_MSG_TREE_LEAF_COUNT, leaf_index);
    l1_to_l2_message_tree_check.exists(
        requested_msg_hash, actual_leaf_value, leaf_index, {}, l1_to_l2_message_tree_snapshot);

    TestTraceContainer trace({ {
        { C::execution_sel_execute_l1_to_l2_message_exists, 1 },
        { C::execution_register_0_, requested_msg_hash },
        { C::execution_register_1_, leaf_index },
        { C::execution_register_2_, /*result=*/0 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U64) },
        { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
        { C::execution_l1_to_l2_msg_leaf_in_range, 1 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_l1_to_l2_msg_tree_leaf_count, static_cast<uint64_t>(L1_TO_L2_MSG_TREE_LEAF_COUNT) },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_L1_TO_L2_MESSAGE_EXISTS },
        { C::execution_l1_l2_tree_root, l1_to_l2_message_tree_snapshot.root },
    } });

    L1ToL2MessageTreeCheckTraceBuilder l1_to_l2_message_tree_check_trace_builder;
    l1_to_l2_message_tree_check_trace_builder.process(l1_to_l2_message_tree_check_event_emitter.dump_events(), trace);

    GreaterThanTraceBuilder greater_than_trace_builder;
    greater_than_trace_builder.process(greater_than_event_emitter.dump_events(), trace);

    check_relation<l1_to_l2_message_exists>(trace);

    check_interaction<ExecutionTraceBuilder,
                      lookup_l1_to_l2_message_exists_l1_to_l2_msg_read_settings,
                      lookup_l1_to_l2_message_exists_l1_to_l2_msg_leaf_index_in_range_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
