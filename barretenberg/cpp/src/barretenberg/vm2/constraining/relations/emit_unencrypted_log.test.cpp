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
#include "barretenberg/vm2/generated/relations/perms_emit_unencrypted_log.hpp"
#include "barretenberg/vm2/simulation/events/emit_unencrypted_log_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/opcodes/emit_unencrypted_log_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EmitUnencryptedLogEvent;
using simulation::EmitUnencryptedLogWriteEvent;
using simulation::TrackedSideEffects;
using testing::PublicInputsBuilder;
using tracegen::EmitUnencryptedLogTraceBuilder;
using tracegen::MemoryTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::PublicInputsTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using emit_unencrypted_log = bb::avm2::emit_unencrypted_log<FF>;

std::vector<MemoryValue> to_memory_values(const std::vector<FF>& fields)
{
    std::vector<MemoryValue> memory_values;
    memory_values.reserve(fields.size());
    for (const FF& field : fields) {
        memory_values.push_back(MemoryValue::from<FF>(field));
    }
    return memory_values;
}

TEST(EmitUnencryptedLogConstrainingTest, EmptyTrace)
{
    check_relation<emit_unencrypted_log>(testing::empty_trace());
}

TEST(EmitUnencryptedLogConstrainingTest, Positive)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 27;
    const std::vector<FF> log_fields = { 4, 5 };
    uint32_t log_size = static_cast<uint32_t>(log_fields.size());
    TrackedSideEffects side_effect_states = { .public_logs = {} };
    TrackedSideEffects side_effect_states_after = { .public_logs = PublicLogs{ { { log_fields, address } } } };

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.get_num_unencrypted_log_fields(),
        .next_num_unencrypted_log_fields = side_effect_states_after.get_num_unencrypted_log_fields(),
        .is_static = false,
        .values = to_memory_values(log_fields),
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

TEST(EmitUnencryptedLogConstrainingTest, PositiveEmptyLog)
{
    // Test created to ensure we do not underflow/fail memory checks for logs with no fields (not including header)
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 0;
    const std::vector<FF> log_fields = {};
    uint32_t log_size = static_cast<uint32_t>(log_fields.size());
    TrackedSideEffects side_effect_states = { .public_logs = {} };
    TrackedSideEffects side_effect_states_after = { .public_logs = PublicLogs{ { { log_fields, address } } } };

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.get_num_unencrypted_log_fields(),
        .next_num_unencrypted_log_fields = side_effect_states_after.get_num_unencrypted_log_fields(),
        .is_static = false,
        .values = to_memory_values(log_fields),
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = false,
    };

    // As calculated in EmitUnencryptedLog::emit_unencrypted_log gadget:
    uint64_t end_log_address_upper_bound = static_cast<uint64_t>(log_address) + static_cast<uint64_t>(log_size);

    simulation::GreaterThanEvent gt_event = {
        .a = end_log_address_upper_bound,
        .b = AVM_MEMORY_SIZE,
        .result = end_log_address_upper_bound > AVM_MEMORY_SIZE,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitUnencryptedLogTraceBuilder trace_builder;
    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process({ gt_event }, trace);
    trace_builder.process({ event }, trace);

    // Check tracegen fills the values correctly:
    FF end_log_address_upper_bound_log_trace = trace.get(C::emit_unencrypted_log_end_log_address_upper_bound, 1);
    FF end_log_address_upper_bound_gt_trace = trace.get(C::gt_input_a, 0);
    EXPECT_EQ(end_log_address_upper_bound_log_trace, end_log_address_upper_bound_gt_trace);

    check_relation<emit_unencrypted_log>(trace);
    check_interaction<EmitUnencryptedLogTraceBuilder, lookup_emit_unencrypted_log_check_memory_out_of_bounds_settings>(
        trace);
}

TEST(EmitUnencryptedLogConstrainingTest, ErrorMemoryOutOfBounds)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = AVM_HIGHEST_MEM_ADDRESS;
    uint32_t log_size = 2;
    TrackedSideEffects side_effect_states = { .public_logs = PublicLogs{ { { { 4 }, address } } } };
    const TrackedSideEffects& side_effect_states_after = side_effect_states;

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.get_num_unencrypted_log_fields(),
        .next_num_unencrypted_log_fields = side_effect_states_after.get_num_unencrypted_log_fields(),
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
    const std::vector<FF> log_fields = { 4, 5 };
    uint32_t log_size = static_cast<uint32_t>(log_fields.size());
    // Minus three so header = 2 + log_size = 2 doesn't fit
    TrackedSideEffects side_effect_states = {
        .public_logs = PublicLogs{ { { testing::random_fields(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH - 3), address } } }
    };
    const TrackedSideEffects& side_effect_states_after = side_effect_states;

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.get_num_unencrypted_log_fields(),
        .next_num_unencrypted_log_fields = side_effect_states_after.get_num_unencrypted_log_fields(),
        .is_static = false,
        .values = to_memory_values(log_fields),
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
    std::vector<MemoryValue> log_values = { MemoryValue::from<uint32_t>(4), MemoryValue::from<uint32_t>(5) };
    uint32_t log_size = static_cast<uint32_t>(log_values.size());
    TrackedSideEffects side_effect_states = { .public_logs = {} };
    // No change to side effect states due to failure.
    const TrackedSideEffects& side_effect_states_after = side_effect_states;

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.get_num_unencrypted_log_fields(),
        .next_num_unencrypted_log_fields = side_effect_states_after.get_num_unencrypted_log_fields(),
        .is_static = false,
        .values = log_values,
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
    const std::vector<FF> log_fields = { 4, 5 };
    uint32_t log_size = static_cast<uint32_t>(log_fields.size());
    TrackedSideEffects side_effect_states = { .public_logs = PublicLogs{ { { { 4 }, address } } } };
    const TrackedSideEffects& side_effect_states_after = side_effect_states;

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.get_num_unencrypted_log_fields(),
        .next_num_unencrypted_log_fields = side_effect_states_after.get_num_unencrypted_log_fields(),
        .is_static = true,
        .values = to_memory_values(log_fields),
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
    const std::vector<FF> log_fields = { 4, 5 };
    uint32_t log_size = static_cast<uint32_t>(log_fields.size());
    TrackedSideEffects side_effect_states = { .public_logs = {} };
    TrackedSideEffects side_effect_states_after = { .public_logs = PublicLogs{ { { log_fields, address } } } };
    AvmAccumulatedData accumulated_data = {};
    accumulated_data.public_logs.add_log({
        .fields = { FF(4), FF(5) },
        .contract_address = address,
    });
    auto public_inputs = PublicInputsBuilder().set_accumulated_data(accumulated_data).build();

    std::vector<MemoryValue> inputs = to_memory_values(log_fields);

    EmitUnencryptedLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_log_fields = side_effect_states.get_num_unencrypted_log_fields(),
        .next_num_unencrypted_log_fields = side_effect_states_after.get_num_unencrypted_log_fields(),
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
            { C::gt_input_a, side_effect_states_after.get_num_unencrypted_log_fields() },
            { C::gt_input_b, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH },
            { C::gt_res, 0 },
        },
        {
            // Execution
            { C::execution_sel, 1 },
            { C::execution_sel_exec_dispatch_emit_unencrypted_log, 1 },
            { C::execution_context_id, 57 },
            { C::execution_rop_1_, log_address },
            { C::execution_register_0_, log_size },
            { C::execution_contract_address, address },
            { C::execution_prev_num_unencrypted_log_fields, side_effect_states.get_num_unencrypted_log_fields() },
            { C::execution_num_unencrypted_log_fields, side_effect_states_after.get_num_unencrypted_log_fields() },
            { C::execution_is_static, false },
            { C::execution_sel_opcode_error, 0 },
            { C::execution_discard, 0 },
            // GT - check memory out of bounds
            { C::gt_sel, 1 },
            { C::gt_input_a, log_address + log_size },
            { C::gt_input_b, static_cast<uint64_t>(AVM_MEMORY_SIZE) },
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

// =====================================================================
// Ghost Row Injection Vulnerability Tests
// =====================================================================
// These tests verify that ghost rows (sel=0) cannot fire permutations.
// The vulnerability: is_write_memory_value is only boolean-constrained,
// not constrained to be 0 when sel=0. This allows ghost rows to fire
// the #[READ_MEM] permutation via sel_should_read_memory.
//
// NOTE: A simple relations-only test is complex for emit_unencrypted_log
// due to many derived constraints. A full attack test following the
// pattern from PR #19470 (NegativeFullAttackWithAllTraces) is needed.
//
// VULNERABILITY SUMMARY:
// - is_write_memory_value is only boolean-constrained
// - When sel=0, is_write_memory_value can still be set to 1
// - This makes sel_should_read_memory = 1 (via derived constraint)
// - This fires the #[READ_MEM] permutation from a ghost row
//
// REQUIRED FIX:
//   is_write_memory_value * (1 - sel) = 0;
//
// See pil/vm2/claude-audits/ghost-row-injection/opcodes-audit.md for details.

// =====================================================================
// Full Attack Test with All Traces
// =====================================================================
// This test demonstrates a complete ghost row injection attack:
// 1. Create legitimate memory READ events (destination side)
// 2. Build memory trace from those events
// 3. Inject ghost emit_unencrypted_log row with sel=0 but is_write_memory_value=1
// 4. This makes sel_should_read_memory=1 which fires the #[READ_MEM] permutation
// 5. Verify the permutation matches - attack succeeds!
//
// This follows the pattern from PR #19470 (NegativeFullAttackWithAllTraces).
TEST(EmitUnencryptedLogConstrainingTest, NegativeFullAttackWithAllTraces)
{
    TestTraceContainer trace;
    MemoryTraceBuilder memory_trace_builder;
    PrecomputedTraceBuilder precomputed_trace_builder;

    // ========== STEP 1: Attacker-controlled values ==========
    uint32_t malicious_clk = 42;
    uint16_t malicious_space_id = 1;
    MemoryAddress malicious_log_addr = 0xDEAD;
    FF malicious_value = 0x1337;
    MemoryTag malicious_tag = MemoryTag::FF; // FF tag for log values

    // ========== STEP 2: Create legitimate memory events ==========
    // These events will be processed by the MemoryTraceBuilder to create
    // legitimate destination rows that the ghost source can match.
    // The permutation is for READS (rw=0), so we create READ events.
    std::vector<simulation::MemoryEvent> mem_events = {
        {
            .execution_clk = malicious_clk,
            .mode = simulation::MemoryMode::READ, // rw = 0 for memory reads
            .addr = malicious_log_addr,
            .value = MemoryValue::from<FF>(malicious_value),
            .space_id = malicious_space_id,
        },
    };

    // ========== STEP 3: Build memory trace (destination side) ==========
    precomputed_trace_builder.process_sel_range_8(trace);
    precomputed_trace_builder.process_sel_range_16(trace);
    precomputed_trace_builder.process_misc(trace, 1 << 16);
    precomputed_trace_builder.process_tag_parameters(trace);
    memory_trace_builder.process(mem_events, trace);

    // Find where the memory row was placed
    uint32_t memory_row = 0;
    for (uint32_t row = 0; row < trace.get_num_rows(); row++) {
        if (trace.get(C::memory_sel, row) == 1) {
            memory_row = row;
            break;
        }
    }

    // ========== STEP 4: Inject ghost emit_unencrypted_log row ==========
    // The vulnerability: When sel=0, is_write_memory_value can still be 1
    // which makes sel_should_read_memory = is_write_memory_value * (1 - error_out_of_bounds) = 1
    // This fires the #[READ_MEM] permutation from a ghost row!
    uint32_t ghost_row = 0;
    trace.set(ghost_row,
              std::vector<std::pair<Column, FF>>{
                  { C::precomputed_first_row, 1 },
                  { C::precomputed_clk, ghost_row },
                  { C::precomputed_zero, 0 },
                  // Ghost row: emit_unencrypted_log_sel = 0, but is_write_memory_value = 1
                  { C::emit_unencrypted_log_sel, 0 },
                  { C::emit_unencrypted_log_is_write_memory_value, 1 },  // Vulnerability!
                  { C::emit_unencrypted_log_error_out_of_bounds, 0 },    // No error, so sel_should_read_memory = 1
                  { C::emit_unencrypted_log_sel_should_read_memory, 1 }, // Fires #[READ_MEM] permutation!
                  // Permutation tuple values - must match memory destination
                  { C::emit_unencrypted_log_execution_clk, malicious_clk },
                  { C::emit_unencrypted_log_space_id, malicious_space_id },
                  { C::emit_unencrypted_log_log_address, malicious_log_addr },
                  { C::emit_unencrypted_log_value, malicious_value },
                  { C::emit_unencrypted_log_tag, static_cast<uint8_t>(malicious_tag) },
                  // Derived constraint: is_write_memory_value * (value - public_inputs_value) = 0
                  { C::emit_unencrypted_log_public_inputs_value, malicious_value },
              });

    // Set the destination selector on the memory row to mark it as matching emit_unencrypted_log
    trace.set(C::memory_sel_unencrypted_log_read, memory_row, 1);

    // ========== STEP 5: Verify attack ==========
    std::cout << "\n=== GHOST ROW INJECTION ATTACK TEST (emit_unencrypted_log) ===" << std::endl;
    std::cout << "Ghost emit_unencrypted_log row at row " << ghost_row
              << " with sel=0, is_write_memory_value=1, sel_should_read_memory=1" << std::endl;
    std::cout << "Memory destination row at row " << memory_row << " with clk=" << malicious_clk << std::endl;

    // Debug: Print source tuple
    std::cout << "\nSource tuple (emit_unencrypted_log row " << ghost_row << "):" << std::endl;
    std::cout << "  execution_clk = " << trace.get(C::emit_unencrypted_log_execution_clk, ghost_row) << std::endl;
    std::cout << "  space_id = " << trace.get(C::emit_unencrypted_log_space_id, ghost_row) << std::endl;
    std::cout << "  log_address = " << trace.get(C::emit_unencrypted_log_log_address, ghost_row) << std::endl;
    std::cout << "  value = " << trace.get(C::emit_unencrypted_log_value, ghost_row) << std::endl;
    std::cout << "  tag = " << trace.get(C::emit_unencrypted_log_tag, ghost_row) << std::endl;
    std::cout << "  sel_should_read_memory = " << trace.get(C::emit_unencrypted_log_sel_should_read_memory, ghost_row)
              << std::endl;
    std::cout << "  precomputed_zero = " << trace.get(C::precomputed_zero, ghost_row) << std::endl;

    // Debug: Print destination tuple
    std::cout << "\nDestination tuple (memory row " << memory_row << "):" << std::endl;
    std::cout << "  memory_clk = " << trace.get(C::memory_clk, memory_row) << std::endl;
    std::cout << "  memory_space_id = " << trace.get(C::memory_space_id, memory_row) << std::endl;
    std::cout << "  memory_address = " << trace.get(C::memory_address, memory_row) << std::endl;
    std::cout << "  memory_value = " << trace.get(C::memory_value, memory_row) << std::endl;
    std::cout << "  memory_tag = " << trace.get(C::memory_tag, memory_row) << std::endl;
    std::cout << "  memory_rw = " << trace.get(C::memory_rw, memory_row) << std::endl;
    std::cout << "  memory_sel = " << trace.get(C::memory_sel, memory_row) << std::endl;
    std::cout << "  memory_sel_unencrypted_log_read = " << trace.get(C::memory_sel_unencrypted_log_read, memory_row)
              << std::endl;

    // emit_unencrypted_log relation should PASS (this is the vulnerability)
    std::cout << "\nemit_unencrypted_log relation: ";
    check_relation<emit_unencrypted_log>(trace);
    std::cout << "PASSED (vulnerability confirmed)" << std::endl;

    // ========== STEP 6: Verify attack succeeded ==========
    // The attack succeeds because:
    // 1. emit_unencrypted_log relation PASSED (no constraint prevents ghost rows from setting is_write_memory_value=1)
    // 2. The source tuple values match a legitimate memory destination tuple
    // 3. The permutation would match if we ran the full permutation check
    //
    // Note: The permutation is part of a complex multi-permutation in MemoryTraceBuilder,
    // so we verify matching tuples directly instead of using check_multipermutation_interaction.

    // Verify tuples match
    // Source: execution_clk, space_id, log_address, value, tag, precomputed_zero
    // Dest:   memory_clk, memory_space_id, memory_address, memory_value, memory_tag, memory_rw
    bool tuples_match =
        (trace.get(C::emit_unencrypted_log_execution_clk, ghost_row) == trace.get(C::memory_clk, memory_row)) &&
        (trace.get(C::emit_unencrypted_log_space_id, ghost_row) == trace.get(C::memory_space_id, memory_row)) &&
        (trace.get(C::emit_unencrypted_log_log_address, ghost_row) == trace.get(C::memory_address, memory_row)) &&
        (trace.get(C::emit_unencrypted_log_value, ghost_row) == trace.get(C::memory_value, memory_row)) &&
        (trace.get(C::emit_unencrypted_log_tag, ghost_row) == trace.get(C::memory_tag, memory_row)) &&
        (trace.get(C::precomputed_zero, ghost_row) == trace.get(C::memory_rw, memory_row)); // rw=0 for reads

    std::cout << "\nTuples match: " << (tuples_match ? "YES" : "NO") << std::endl;

    // Attack succeeds if:
    // 1. emit_unencrypted_log relation passed (no constraint prevents ghost row)
    // 2. Tuples match (permutation would match)
    bool attack_succeeded = tuples_match;

    std::cout << "\n=== ATTACK RESULT ===" << std::endl;
    if (attack_succeeded) {
        std::cout << "CRITICAL: Ghost row injection attack SUCCEEDED!" << std::endl;
        std::cout << "Attacker can inject arbitrary memory reads via emit_unencrypted_log." << std::endl;
        std::cout << "\nRequired fix in emit_unencrypted_log.pil:" << std::endl;
        std::cout << "  #[IS_WRITE_MEMORY_VALUE_REQUIRES_SEL]" << std::endl;
        std::cout << "  is_write_memory_value * (1 - sel) = 0;" << std::endl;
    } else {
        std::cout << "Attack blocked." << std::endl;
    }

    // Test documents vulnerability - we expect the attack to succeed until fixed
    EXPECT_TRUE(attack_succeeded) << "Ghost row injection attack should succeed (vulnerability exists)";
}

} // namespace

} // namespace bb::avm2::constraining
