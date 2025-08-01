#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::PublicInputsTraceBuilder;
using tracegen::TestTraceContainer;

using testing::PublicInputsBuilder;

using FF = AvmFlavorSettings::FF;
using C = Column;
using send_l2_to_l1_msg = bb::avm2::send_l2_to_l1_msg<FF>;

TEST(SendL2ToL1MsgConstrainingTest, Positive)
{
    uint64_t prev_num_l2_to_l1_msgs = MAX_L2_TO_L1_MSGS_PER_TX - 1;
    TestTraceContainer trace({ {
        { C::execution_sel_execute_send_l2_to_l1_msg, 1 },
        { C::execution_register_0_, /*recipient=*/42 },
        { C::execution_register_1_, /*content=*/27 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_remaining_l2_to_l1_msgs_inv, FF(MAX_L2_TO_L1_MSGS_PER_TX - prev_num_l2_to_l1_msgs).invert() },
        { C::execution_sel_write_l2_to_l1_msg, 1 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_public_inputs_index,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + prev_num_l2_to_l1_msgs },
        { C::execution_prev_num_l2_to_l1_messages, prev_num_l2_to_l1_msgs },
        { C::execution_num_l2_to_l1_messages, prev_num_l2_to_l1_msgs + 1 },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SENDL2TOL1MSG },

    } });
    check_relation<send_l2_to_l1_msg>(trace);
}

TEST(SendL2ToL1MsgConstrainingTest, LimitReached)
{
    uint64_t prev_num_l2_to_l1_msgs = MAX_L2_TO_L1_MSGS_PER_TX;
    TestTraceContainer trace({ {
        { C::execution_sel_execute_send_l2_to_l1_msg, 1 },
        { C::execution_register_0_, /*recipient=*/42 },
        { C::execution_register_1_, /*content=*/27 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_sel_l2_to_l1_msg_limit_error, 1 },
        { C::execution_remaining_l2_to_l1_msgs_inv, 0 },
        { C::execution_sel_write_l2_to_l1_msg, 0 },
        { C::execution_sel_opcode_error, 1 },
        { C::execution_public_inputs_index,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + prev_num_l2_to_l1_msgs },
        { C::execution_prev_num_l2_to_l1_messages, prev_num_l2_to_l1_msgs },
        { C::execution_num_l2_to_l1_messages, prev_num_l2_to_l1_msgs },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SENDL2TOL1MSG },
    } });
    check_relation<send_l2_to_l1_msg>(trace);

    // Negative test: sel_opcode_error must be on
    trace.set(C::execution_sel_opcode_error, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<send_l2_to_l1_msg>(trace, send_l2_to_l1_msg::SR_OPCODE_ERROR),
                              "OPCODE_ERROR");
    trace.set(C::execution_sel_opcode_error, 0, 1);

    // Negative test: num l2 to l1 messages must be the same
    trace.set(C::execution_num_l2_to_l1_messages, 0, prev_num_l2_to_l1_msgs + 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<send_l2_to_l1_msg>(
                                  trace, send_l2_to_l1_msg::SR_EMIT_L2_TO_L1_MSG_NUM_L2_TO_L1_MSGS_EMITTED_INCREASE),
                              "EMIT_L2_TO_L1_MSG_NUM_L2_TO_L1_MSGS_EMITTED_INCREASE");
}

TEST(SendL2ToL1MsgConstrainingTest, Discard)
{
    uint64_t prev_num_l2_to_l1_msgs = 0;
    TestTraceContainer trace({ {
        { C::execution_sel_execute_send_l2_to_l1_msg, 1 },
        { C::execution_register_0_, /*recipient=*/42 },
        { C::execution_register_1_, /*content=*/27 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_remaining_l2_to_l1_msgs_inv, FF(MAX_L2_TO_L1_MSGS_PER_TX - prev_num_l2_to_l1_msgs).invert() },
        { C::execution_sel_write_l2_to_l1_msg, 0 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_public_inputs_index,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + prev_num_l2_to_l1_msgs },
        { C::execution_discard, 1 },
        { C::execution_prev_num_l2_to_l1_messages, prev_num_l2_to_l1_msgs },
        { C::execution_num_l2_to_l1_messages, prev_num_l2_to_l1_msgs + 1 },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SENDL2TOL1MSG },
    } });
    check_relation<send_l2_to_l1_msg>(trace);

    // Negative test: num l2 to l1 messages should increase when discarding
    trace.set(C::execution_num_l2_to_l1_messages, 0, prev_num_l2_to_l1_msgs);
    EXPECT_THROW_WITH_MESSAGE(check_relation<send_l2_to_l1_msg>(
                                  trace, send_l2_to_l1_msg::SR_EMIT_L2_TO_L1_MSG_NUM_L2_TO_L1_MSGS_EMITTED_INCREASE),
                              "EMIT_L2_TO_L1_MSG_NUM_L2_TO_L1_MSGS_EMITTED_INCREASE");
}

TEST(SendL2ToL1MsgConstrainingTest, Interactions)
{
    uint64_t prev_num_l2_to_l1_msgs = 0;
    FF recipient = 42;
    FF content = 27;
    AztecAddress address = 0xdeadbeef;
    AvmAccumulatedData accumulated_data = {};

    accumulated_data.l2ToL1Msgs[0] = {
        .message =
            L2ToL1Message{
                .recipient = recipient,
                .content = content,
            },
        .contractAddress = address,
    };
    AvmAccumulatedDataArrayLengths array_lengths = { .l2ToL1Msgs = 1 };
    auto public_inputs = PublicInputsBuilder()
                             .set_accumulated_data(accumulated_data)
                             .set_accumulated_data_array_lengths(array_lengths)
                             .build();

    TestTraceContainer trace({ {
        { C::execution_sel_execute_send_l2_to_l1_msg, 1 },
        { C::execution_register_0_, recipient },
        { C::execution_register_1_, content },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_remaining_l2_to_l1_msgs_inv, FF(MAX_L2_TO_L1_MSGS_PER_TX - prev_num_l2_to_l1_msgs).invert() },
        { C::execution_sel_write_l2_to_l1_msg, 1 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_public_inputs_index,
          AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + prev_num_l2_to_l1_msgs },
        { C::execution_contract_address, address },
        { C::execution_prev_num_l2_to_l1_messages, prev_num_l2_to_l1_msgs },
        { C::execution_num_l2_to_l1_messages, prev_num_l2_to_l1_msgs + 1 },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SENDL2TOL1MSG },
    } });

    PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    tracegen::PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, trace.get_num_rows());

    check_relation<send_l2_to_l1_msg>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_send_l2_to_l1_msg_write_l2_to_l1_msg_settings>(trace);
}

TEST(SendL2ToL1MsgConstrainingTest, NegativeShouldErrorIfStatic)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_send_l2_to_l1_msg, 1 },
        { C::execution_sel_l2_to_l1_msg_limit_error, 0 },
        { C::execution_is_static, 1 },
        { C::execution_sel_opcode_error, 1 },

    } });
    check_relation<send_l2_to_l1_msg>(trace, send_l2_to_l1_msg::SR_OPCODE_ERROR);

    // Negative test: sel_opcode_error must be on
    trace.set(C::execution_sel_opcode_error, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<send_l2_to_l1_msg>(trace, send_l2_to_l1_msg::SR_OPCODE_ERROR),
                              "OPCODE_ERROR");
}

TEST(SendL2ToL1MsgConstrainingTest, NegativeShouldNotWriteIfDiscard)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_send_l2_to_l1_msg, 1 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_discard, 1 },
        { C::execution_sel_write_l2_to_l1_msg, 0 },
    } });
    check_relation<send_l2_to_l1_msg>(trace, send_l2_to_l1_msg::SR_SEND_L2_TO_L1_MSG_CONDITION);

    // Negative test: sel_write_l2_to_l1_msg must be off
    trace.set(C::execution_sel_write_l2_to_l1_msg, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<send_l2_to_l1_msg>(trace, send_l2_to_l1_msg::SR_SEND_L2_TO_L1_MSG_CONDITION),
        "SEND_L2_TO_L1_MSG_CONDITION");
}

TEST(SendL2ToL1MsgConstrainingTest, NegativeShouldNumL2ToL1MessagesIncrease)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_send_l2_to_l1_msg, 1 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_prev_num_l2_to_l1_messages, 0 },
        { C::execution_num_l2_to_l1_messages, 1 },
    } });
    check_relation<send_l2_to_l1_msg>(trace,
                                      send_l2_to_l1_msg::SR_EMIT_L2_TO_L1_MSG_NUM_L2_TO_L1_MSGS_EMITTED_INCREASE);

    // Negative test: num_l2_to_l1_messages must increase
    trace.set(C::execution_prev_num_l2_to_l1_messages, 0, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<send_l2_to_l1_msg>(
                                  trace, send_l2_to_l1_msg::SR_EMIT_L2_TO_L1_MSG_NUM_L2_TO_L1_MSGS_EMITTED_INCREASE),
                              "EMIT_L2_TO_L1_MSG_NUM_L2_TO_L1_MSGS_EMITTED_INCREASE");
}

} // namespace
} // namespace bb::avm2::constraining
