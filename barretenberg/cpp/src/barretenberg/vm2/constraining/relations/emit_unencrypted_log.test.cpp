#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/emit_unencrypted_log.hpp"
#include "barretenberg/vm2/generated/relations/lookups_emit_unencrypted_log.hpp"
#include "barretenberg/vm2/simulation/events/emit_unencrypted_log_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/tracegen/opcodes/emit_unencrypted_log_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EmitUnencryptedLogEvent;
using simulation::EmitUnencryptedLogWriteEvent;
using testing::PublicInputsBuilder;
using tracegen::EmitUnencryptedLogTraceBuilder;
using tracegen::PublicInputsTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using emit_unencrypted_log = bb::avm2::emit_unencrypted_log<FF>;

TEST(EmitUnencryptedLogConstrainingTest, EmptyTrace)
{
    check_relation<emit_unencrypted_log>(testing::empty_trace());
}

TEST(EmitUnencryptedLogConstrainingTest, Positive)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 27;
    uint32_t log_size = 2;
    SideEffectStates side_effect_states = { .numUnencryptedLogFields = 0 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogFields = 2 + PUBLIC_LOG_HEADER_LENGTH };

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.numUnencryptedLogFields,
        .next_num_unencrypted_log_fields = next_side_effect_states.numUnencryptedLogFields,
        .is_static = false,
        .values = { MemoryValue::from<FF>(FF(4)), MemoryValue::from<FF>(FF(5)) },
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = false,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitUnencryptedLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_unencrypted_log>(trace);
}

TEST(EmitUnencryptedLogConstrainingTest, ErrorMemoryOutOfBounds)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = AVM_HIGHEST_MEM_ADDRESS;
    uint32_t log_size = 2;
    SideEffectStates side_effect_states = { .numUnencryptedLogFields = 1 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogFields = 1 };

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.numUnencryptedLogFields,
        .next_num_unencrypted_log_fields = next_side_effect_states.numUnencryptedLogFields,
        .is_static = false,
        .values = {},
        .error_memory_out_of_bounds = true,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = false,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitUnencryptedLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_unencrypted_log>(trace);
}

TEST(EmitUnencryptedLogConstrainingTest, ErrorTooManyLogFields)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 27;
    uint32_t log_size = 2;
    // Minus three so header = 2 + log_size = 2 doesn't fit
    SideEffectStates side_effect_states = { .numUnencryptedLogFields = FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH - 3 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogFields = FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH - 3 };

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.numUnencryptedLogFields,
        .next_num_unencrypted_log_fields = next_side_effect_states.numUnencryptedLogFields,
        .is_static = false,
        .values = { MemoryValue::from<FF>(FF(4)), MemoryValue::from<FF>(FF(5)) },
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = true,
        .error_tag_mismatch = false,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitUnencryptedLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_unencrypted_log>(trace);
}

TEST(EmitUnencryptedLogConstrainingTest, ErrorTagMismatch)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 27;
    uint32_t log_size = 2;
    SideEffectStates side_effect_states = { .numUnencryptedLogFields = 1 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogFields = 1 };

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.numUnencryptedLogFields,
        .next_num_unencrypted_log_fields = next_side_effect_states.numUnencryptedLogFields,
        .is_static = false,
        .values = { MemoryValue::from<uint32_t>(4), MemoryValue::from<FF>(FF(5)) },
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = true,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitUnencryptedLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_unencrypted_log>(trace);
}

TEST(EmitUnencryptedLogConstrainingTest, ErrorStatic)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 27;
    uint32_t log_size = 2;
    SideEffectStates side_effect_states = { .numUnencryptedLogFields = 1 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogFields = 1 };

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.numUnencryptedLogFields,
        .next_num_unencrypted_log_fields = next_side_effect_states.numUnencryptedLogFields,
        .is_static = true,
        .values = { MemoryValue::from<FF>(FF(4)), MemoryValue::from<FF>(FF(5)) },
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = false,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitUnencryptedLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);
}

TEST(EmitUnencryptedLogConstrainingTest, Interactions)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 27;
    uint32_t log_size = 2;
    SideEffectStates side_effect_states = { .numUnencryptedLogFields = 0 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogFields = PUBLIC_LOG_HEADER_LENGTH + log_size };
    AvmAccumulatedData accumulated_data = {};
    accumulated_data.publicLogs.add_log({
        .fields = { FF(4), FF(5) },
        .contractAddress = address,
    });
    auto public_inputs = PublicInputsBuilder().set_accumulated_data(accumulated_data).build();

    std::vector<MemoryValue> inputs = {
        MemoryValue::from<FF>(FF(4)),
        MemoryValue::from<FF>(FF(5)),
    };

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.numUnencryptedLogFields,
        .next_num_unencrypted_log_fields = next_side_effect_states.numUnencryptedLogFields,
        .is_static = false,
        .values = inputs,
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = false,
    };

    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            { C::precomputed_first_row, 1 },
            // GT - check log size
            { C::gt_sel, 1 },
            { C::gt_input_a, next_side_effect_states.numUnencryptedLogFields },
            { C::gt_input_b, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH },
            { C::gt_res, 0 },
        },
        {
            // Execution
            { C::execution_sel, 1 },
            { C::execution_sel_execute_emit_unencrypted_log, 1 },
            { C::execution_context_id, 57 },
            { C::execution_rop_1_, log_address },
            { C::execution_register_0_, log_size },
            { C::execution_contract_address, address },
            { C::execution_prev_num_unencrypted_log_fields, side_effect_states.numUnencryptedLogFields },
            { C::execution_num_unencrypted_log_fields, next_side_effect_states.numUnencryptedLogFields },
            { C::execution_is_static, false },
            { C::execution_sel_opcode_error, 0 },
            { C::execution_discard, 0 },
            // GT - check memory out of bounds
            { C::gt_sel, 1 },
            { C::gt_input_a, log_address + log_size - 1 },
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 0 },
        },
    });

    // Set up memory trace
    for (uint32_t i = 0; i < inputs.size(); ++i) {
        // Set memory reads
        trace.set(C::memory_address, i + 1, log_address + i);
        trace.set(C::memory_value, i + 1, inputs[i].as_ff());
        trace.set(C::memory_tag, i + 1, static_cast<uint32_t>(inputs[i].get_tag()));
        trace.set(C::memory_sel, i + 1, 1);
        trace.set(C::memory_clk, i + 1, 1);
        trace.set(C::memory_rw, i + 1, 0);
        trace.set(C::memory_space_id, i + 1, 57);
    }

    PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    tracegen::PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, trace.get_num_rows());

    EmitUnencryptedLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_unencrypted_log>(trace);
    check_all_interactions<EmitUnencryptedLogTraceBuilder>(trace);
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeStartAfterLatch)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::precomputed_first_row, 1 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_start, 1 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_start, 1 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_START_AFTER_LATCH);

    trace.set(C::emit_unencrypted_log_end, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_START_AFTER_LATCH),
                              "START_AFTER_LATCH");

    trace.set(C::emit_unencrypted_log_end, 1, 1);
    trace.set(C::precomputed_first_row, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_START_AFTER_LATCH),
                              "START_AFTER_LATCH");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeSelectorOnStart)
{
    TestTraceContainer trace = TestTraceContainer({ {
        { C::emit_unencrypted_log_sel, 1 },
        { C::emit_unencrypted_log_start, 1 },
    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_SELECTOR_ON_START);

    trace.set(C::emit_unencrypted_log_sel, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_SELECTOR_ON_START),
                              "SELECTOR_ON_START");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeSelectorConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::precomputed_first_row, 1 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_start, 1 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 0 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_SELECTOR_CONSISTENCY);

    trace.set(C::emit_unencrypted_log_end, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_SELECTOR_CONSISTENCY),
        "SELECTOR_CONSISTENCY");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeSelectorOnEnd)
{
    TestTraceContainer trace = TestTraceContainer({ {
        { C::emit_unencrypted_log_sel, 1 },
        { C::emit_unencrypted_log_end, 1 },
    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_SELECTOR_ON_END);

    trace.set(C::emit_unencrypted_log_sel, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_SELECTOR_ON_END),
                              "SELECTOR_ON_END");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeRemainingRowsDecrement)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_remaining_rows, 1 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_remaining_rows, 0 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_REMAINING_ROWS_DECREMENT);

    trace.set(C::emit_unencrypted_log_remaining_rows, 1, 1);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_REMAINING_ROWS_DECREMENT),
        "REMAINING_ROWS_DECREMENT");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeErrorOutOfBoundsConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_error_out_of_bounds, 1 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_error_out_of_bounds, 1 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_ERROR_OUT_OF_BOUNDS_CONSISTENCY);

    trace.set(C::emit_unencrypted_log_error_out_of_bounds, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_ERROR_OUT_OF_BOUNDS_CONSISTENCY),
        "ERROR_OUT_OF_BOUNDS_CONSISTENCY");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeErrorTagMismatchConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_error_tag_mismatch, 1 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_error_tag_mismatch, 1 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_ERROR_TAG_MISMATCH_CONSISTENCY);

    trace.set(C::emit_unencrypted_log_error_tag_mismatch, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_ERROR_TAG_MISMATCH_CONSISTENCY),
        "ERROR_TAG_MISMATCH_CONSISTENCY");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeWrongTagCheck)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_seen_wrong_tag, 0 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_seen_wrong_tag, 1 },
                                                        { C::emit_unencrypted_log_correct_tag, 0 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_WRONG_TAG_CHECK);

    trace.set(C::emit_unencrypted_log_seen_wrong_tag, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_WRONG_TAG_CHECK),
                              "WRONG_TAG_CHECK");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeSelectorShouldWriteToPublicInputsConsistency)
{
    TestTraceContainer trace =
        TestTraceContainer({ {
                                 { C::emit_unencrypted_log_sel, 1 },
                                 { C::emit_unencrypted_log_sel_should_write_to_public_inputs, 1 },
                             },
                             {
                                 { C::emit_unencrypted_log_sel, 1 },
                                 { C::emit_unencrypted_log_sel_should_write_to_public_inputs, 1 },
                                 { C::emit_unencrypted_log_end, 1 },
                             } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_SEL_SHOULD_WRITE_TO_PUBLIC_INPUTS_CONSISTENCY);

    trace.set(C::emit_unencrypted_log_sel_should_write_to_public_inputs, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_unencrypted_log>(
                                  trace, emit_unencrypted_log::SR_SEL_SHOULD_WRITE_TO_PUBLIC_INPUTS_CONSISTENCY),
                              "SEL_SHOULD_WRITE_TO_PUBLIC_INPUTS_CONSISTENCY");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeLogOffsetIncrement)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_is_write_memory_value, 1 },
                                                        { C::emit_unencrypted_log_log_address, 10 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_is_write_memory_value, 1 },
                                                        { C::emit_unencrypted_log_log_address, 11 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_LOG_ADDRESS_INCREMENT);

    trace.set(C::emit_unencrypted_log_log_address, 1, 9);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_LOG_ADDRESS_INCREMENT),
        "LOG_ADDRESS_INCREMENT");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeExecutionClkConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_execution_clk, 1 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_execution_clk, 1 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_EXEC_CLK_CONSISTENCY);

    trace.set(C::emit_unencrypted_log_execution_clk, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_EXEC_CLK_CONSISTENCY),
        "EXEC_CLK_CONSISTENCY");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeSpaceIdConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_space_id, 17 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_space_id, 17 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_SPACE_ID_CONSISTENCY);

    trace.set(C::emit_unencrypted_log_space_id, 1, 18);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_SPACE_ID_CONSISTENCY),
        "SPACE_ID_CONSISTENCY");
}

TEST(EmitUnencryptedLogConstrainingTest, NegativeContractAddressConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_contract_address, 42 },
                                                    },
                                                    {
                                                        { C::emit_unencrypted_log_sel, 1 },
                                                        { C::emit_unencrypted_log_contract_address, 42 },
                                                        { C::emit_unencrypted_log_end, 1 },
                                                    } });

    check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_CONTRACT_ADDRESS_CONSISTENCY);

    trace.set(C::emit_unencrypted_log_contract_address, 1, 43);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_unencrypted_log>(trace, emit_unencrypted_log::SR_CONTRACT_ADDRESS_CONSISTENCY),
        "CONTRACT_ADDRESS_CONSISTENCY");
}

} // namespace

} // namespace bb::avm2::constraining
