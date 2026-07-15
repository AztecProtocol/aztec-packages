#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/emit_public_log.hpp"
#include "barretenberg/vm2/generated/relations/lookups_emit_public_log.hpp"
#include "barretenberg/vm2/simulation/events/emit_public_log_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/opcodes/emit_public_log_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EmitPublicLogEvent;
using simulation::EmitPublicLogWriteEvent;
using simulation::TrackedSideEffects;
using testing::PublicInputsBuilder;
using tracegen::EmitPublicLogTraceBuilder;
using tracegen::MemoryTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::PublicInputsTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using emit_public_log = bb::avm2::emit_public_log<FF>;

std::vector<MemoryValue> to_memory_values(const std::vector<FF>& fields)
{
    std::vector<MemoryValue> memory_values;
    memory_values.reserve(fields.size());
    for (const FF& field : fields) {
        memory_values.push_back(MemoryValue::from<FF>(field));
    }
    return memory_values;
}

TEST(EmitPublicLogConstrainingTest, EmptyTrace)
{
    check_relation<emit_public_log>(testing::empty_trace());
}

TEST(EmitPublicLogConstrainingTest, Positive)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 27;
    const std::vector<FF> log_fields = { 4, 5 };
    uint32_t log_size = static_cast<uint32_t>(log_fields.size());
    TrackedSideEffects side_effect_states = { .public_logs = {} };
    TrackedSideEffects side_effect_states_after = { .public_logs = PublicLogs{ { { log_fields, address } } } };

    EmitPublicLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_public_log_fields = side_effect_states.get_num_public_log_fields(),
        .next_num_public_log_fields = side_effect_states_after.get_num_public_log_fields(),
        .is_static = false,
        .values = to_memory_values(log_fields),
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = false,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitPublicLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_public_log>(trace);
}

TEST(EmitPublicLogConstrainingTest, PositiveEmptyLog)
{
    // Test created to ensure we do not underflow/fail memory checks for logs with no fields (not including header)
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 0;
    const std::vector<FF> log_fields = {};
    uint32_t log_size = static_cast<uint32_t>(log_fields.size());
    TrackedSideEffects side_effect_states = { .public_logs = {} };
    TrackedSideEffects side_effect_states_after = { .public_logs = PublicLogs{ { { log_fields, address } } } };

    EmitPublicLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_public_log_fields = side_effect_states.get_num_public_log_fields(),
        .next_num_public_log_fields = side_effect_states_after.get_num_public_log_fields(),
        .is_static = false,
        .values = to_memory_values(log_fields),
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = false,
    };

    // As calculated in EmitPublicLog::emit_public_log gadget:
    uint64_t end_log_address_upper_bound = static_cast<uint64_t>(log_address) + static_cast<uint64_t>(log_size);

    simulation::GreaterThanEvent gt_event = {
        .a = end_log_address_upper_bound,
        .b = AVM_MEMORY_SIZE,
        .result = end_log_address_upper_bound > AVM_MEMORY_SIZE,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitPublicLogTraceBuilder trace_builder;
    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process({ gt_event }, trace);
    trace_builder.process({ event }, trace);

    // Check tracegen fills the values correctly:
    FF end_log_address_upper_bound_log_trace = trace.get(C::emit_public_log_end_log_address_upper_bound, 1);
    FF end_log_address_upper_bound_gt_trace = trace.get(C::gt_input_a, 0);
    EXPECT_EQ(end_log_address_upper_bound_log_trace, end_log_address_upper_bound_gt_trace);

    check_relation<emit_public_log>(trace);
    check_interaction<EmitPublicLogTraceBuilder, lookup_emit_public_log_check_memory_out_of_bounds_settings>(trace);
}

TEST(EmitPublicLogConstrainingTest, ErrorMemoryOutOfBounds)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = AVM_HIGHEST_MEM_ADDRESS;
    uint32_t log_size = 2;
    TrackedSideEffects side_effect_states = { .public_logs = PublicLogs{ { { { 4 }, address } } } };
    const TrackedSideEffects& side_effect_states_after = side_effect_states;

    EmitPublicLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_public_log_fields = side_effect_states.get_num_public_log_fields(),
        .next_num_public_log_fields = side_effect_states_after.get_num_public_log_fields(),
        .is_static = false,
        .values = {},
        .error_memory_out_of_bounds = true,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = false,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitPublicLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_public_log>(trace);
}

TEST(EmitPublicLogConstrainingTest, ErrorTooManyLogFields)
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

    EmitPublicLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_public_log_fields = side_effect_states.get_num_public_log_fields(),
        .next_num_public_log_fields = side_effect_states_after.get_num_public_log_fields(),
        .is_static = false,
        .values = to_memory_values(log_fields),
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = true,
        .error_tag_mismatch = false,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitPublicLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_public_log>(trace);
}

TEST(EmitPublicLogConstrainingTest, ErrorTagMismatch)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 27;
    std::vector<MemoryValue> log_values = { MemoryValue::from<uint32_t>(4), MemoryValue::from<uint32_t>(5) };
    uint32_t log_size = static_cast<uint32_t>(log_values.size());
    TrackedSideEffects side_effect_states = { .public_logs = {} };
    // No change to side effect states due to failure.
    const TrackedSideEffects& side_effect_states_after = side_effect_states;

    EmitPublicLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_public_log_fields = side_effect_states.get_num_public_log_fields(),
        .next_num_public_log_fields = side_effect_states_after.get_num_public_log_fields(),
        .is_static = false,
        .values = log_values,
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = true,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitPublicLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_public_log>(trace);
}

TEST(EmitPublicLogConstrainingTest, ErrorStatic)
{
    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_address = 27;
    const std::vector<FF> log_fields = { 4, 5 };
    uint32_t log_size = static_cast<uint32_t>(log_fields.size());
    TrackedSideEffects side_effect_states = { .public_logs = PublicLogs{ { { { 4 }, address } } } };
    const TrackedSideEffects& side_effect_states_after = side_effect_states;

    EmitPublicLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_public_log_fields = side_effect_states.get_num_public_log_fields(),
        .next_num_public_log_fields = side_effect_states_after.get_num_public_log_fields(),
        .is_static = true,
        .values = to_memory_values(log_fields),
        .error_memory_out_of_bounds = false,
        .error_too_many_log_fields = false,
        .error_tag_mismatch = false,
    };

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    EmitPublicLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_public_log>(trace);
}

TEST(EmitPublicLogConstrainingTest, Interactions)
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

    EmitPublicLogWriteEvent event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_public_log_fields = side_effect_states.get_num_public_log_fields(),
        .next_num_public_log_fields = side_effect_states_after.get_num_public_log_fields(),
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
            { C::gt_input_a, side_effect_states_after.get_num_public_log_fields() },
            { C::gt_input_b, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH },
            { C::gt_res, 0 },
        },
        {
            // Execution
            { C::execution_sel, 1 },
            { C::execution_sel_exec_dispatch_emit_public_log, 1 },
            { C::execution_context_id, 57 },
            { C::execution_rop_1_, log_address },
            { C::execution_register_0_, log_size },
            { C::execution_contract_address, address },
            { C::execution_prev_num_public_log_fields, side_effect_states.get_num_public_log_fields() },
            { C::execution_num_public_log_fields, side_effect_states_after.get_num_public_log_fields() },
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

    EmitPublicLogTraceBuilder trace_builder;
    trace_builder.process({ event }, trace);

    check_relation<emit_public_log>(trace);
    check_all_interactions<EmitPublicLogTraceBuilder>(trace);
}

TEST(EmitPublicLogConstrainingTest, NegativeStartAfterLatch)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::precomputed_first_row, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_start, 1 },
                                                        { C::emit_public_log_end, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_start, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_START_AFTER_LATCH);

    trace.set(C::emit_public_log_end, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_START_AFTER_LATCH),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_START_AFTER_LATCH));

    trace.set(C::emit_public_log_end, 1, 1);
    trace.set(C::precomputed_first_row, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_START_AFTER_LATCH),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_START_AFTER_LATCH));
}

TEST(EmitPublicLogConstrainingTest, NegativeTraceContinuity)
{
    // Once sel drops to 0, it cannot come back to 1 (on non-first rows).
    // Row 0: first_row=1, sel=1, start=1 (LATCH_CONDITION=1 via first_row)
    // Row 1: sel=1, end=1 (LATCH_CONDITION=1 via end, allows sel to drop)
    // Row 2: sel=0
    // Row 3: sel=0 (positive) / sel=1 (negative, violates continuity)
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::precomputed_first_row, 1 },
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_start, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_end, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 0 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 0 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_TRACE_CONTINUITY);

    // Now make sel come back to 1 after a gap.
    trace.set(C::emit_public_log_sel, 3, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_TRACE_CONTINUITY),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_TRACE_CONTINUITY));
}

TEST(EmitPublicLogConstrainingTest, NegativeComputationFinishAtEnd)
{
    // sel can only turn off (sel=1 -> sel'=0) when end=1.
    // Row 0: first_row=1, sel=1, start=1 (LATCH_CONDITION=1 via first_row)
    // Row 1: sel=1, end=0 (sel drops to 0 on next row without end=1)
    // Row 2: sel=0 (violates TRACE_CONTINUITY at row 1)
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::precomputed_first_row, 1 },
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_start, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 0 },
                                                    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_TRACE_CONTINUITY),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_TRACE_CONTINUITY));

    // Adding end=1 on row 1 should satisfy the constraint.
    trace.set(C::emit_public_log_end, 1, 1);

    check_relation<emit_public_log>(trace, emit_public_log::SR_TRACE_CONTINUITY);
}

TEST(EmitPublicLogConstrainingTest, NegativeRemainingRowsDecrement)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_remaining_rows, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_remaining_rows, 0 },
                                                        { C::emit_public_log_end, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_REMAINING_ROWS_DECREMENT);

    trace.set(C::emit_public_log_remaining_rows, 1, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_REMAINING_ROWS_DECREMENT),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_REMAINING_ROWS_DECREMENT));
}

TEST(EmitPublicLogConstrainingTest, NegativeErrorOutOfBoundsConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_error_out_of_bounds, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_error_out_of_bounds, 1 },
                                                        { C::emit_public_log_end, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_ERROR_OUT_OF_BOUNDS_CONSISTENCY);

    trace.set(C::emit_public_log_error_out_of_bounds, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_public_log>(trace, emit_public_log::SR_ERROR_OUT_OF_BOUNDS_CONSISTENCY),
        emit_public_log::get_subrelation_label(emit_public_log::SR_ERROR_OUT_OF_BOUNDS_CONSISTENCY));
}

TEST(EmitPublicLogConstrainingTest, NegativeErrorTagMismatchConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_error_tag_mismatch, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_error_tag_mismatch, 1 },
                                                        { C::emit_public_log_end, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_ERROR_TAG_MISMATCH_CONSISTENCY);

    trace.set(C::emit_public_log_error_tag_mismatch, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_public_log>(trace, emit_public_log::SR_ERROR_TAG_MISMATCH_CONSISTENCY),
        emit_public_log::get_subrelation_label(emit_public_log::SR_ERROR_TAG_MISMATCH_CONSISTENCY));
}

TEST(EmitPublicLogConstrainingTest, NegativeWrongTagCheck)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_seen_wrong_tag, 0 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_seen_wrong_tag, 1 },
                                                        { C::emit_public_log_correct_tag, 0 },
                                                        { C::emit_public_log_end, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_WRONG_TAG_CHECK);

    trace.set(C::emit_public_log_seen_wrong_tag, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_WRONG_TAG_CHECK),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_WRONG_TAG_CHECK));
}

TEST(EmitPublicLogConstrainingTest, NegativeSelectorShouldWriteToPublicInputsConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_sel_write_to_public_inputs, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_sel_write_to_public_inputs, 1 },
                                                        { C::emit_public_log_end, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_SEL_SHOULD_WRITE_TO_PUBLIC_INPUTS_CONSISTENCY);

    trace.set(C::emit_public_log_sel_write_to_public_inputs, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_public_log>(trace, emit_public_log::SR_SEL_SHOULD_WRITE_TO_PUBLIC_INPUTS_CONSISTENCY),
        emit_public_log::get_subrelation_label(emit_public_log::SR_SEL_SHOULD_WRITE_TO_PUBLIC_INPUTS_CONSISTENCY));
}

TEST(EmitPublicLogConstrainingTest, NegativeLogOffsetIncrement)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_is_write_memory_value, 1 },
                                                        { C::emit_public_log_log_address, 10 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_is_write_memory_value, 1 },
                                                        { C::emit_public_log_log_address, 11 },
                                                        { C::emit_public_log_end, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_LOG_ADDRESS_INCREMENT);

    trace.set(C::emit_public_log_log_address, 1, 9);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_LOG_ADDRESS_INCREMENT),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_LOG_ADDRESS_INCREMENT));
}

TEST(EmitPublicLogConstrainingTest, NegativeExecutionClkConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_execution_clk, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_execution_clk, 1 },
                                                        { C::emit_public_log_end, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_EXEC_CLK_CONSISTENCY);

    trace.set(C::emit_public_log_execution_clk, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_EXEC_CLK_CONSISTENCY),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_EXEC_CLK_CONSISTENCY));
}

TEST(EmitPublicLogConstrainingTest, NegativeSpaceIdConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_space_id, 17 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_space_id, 17 },
                                                        { C::emit_public_log_end, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_SPACE_ID_CONSISTENCY);

    trace.set(C::emit_public_log_space_id, 1, 18);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_SPACE_ID_CONSISTENCY),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_SPACE_ID_CONSISTENCY));
}

TEST(EmitPublicLogConstrainingTest, NegativeContractAddressConsistency)
{
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_contract_address, 42 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_contract_address, 42 },
                                                        { C::emit_public_log_end, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_CONTRACT_ADDRESS_CONSISTENCY);

    trace.set(C::emit_public_log_contract_address, 1, 43);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_CONTRACT_ADDRESS_CONSISTENCY),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_CONTRACT_ADDRESS_CONSISTENCY));
}

// =====================================================================
// Ghost Row Injection Vulnerability Tests
// =====================================================================
// These tests verify that ghost rows (sel=0) cannot fire permutations.
// This is a defensive/sanity check: even though the situation is hard to exploit,
// we still enforce the selector gating to prevent accidental ghost reads.
// The vulnerability: is_write_memory_value is only boolean-constrained,
// not constrained to be 0 when sel=0. This allows ghost rows to fire
// the #[READ_MEM] permutation via sel_read_memory.
//
// VULNERABILITY SUMMARY:
// - is_write_memory_value is only boolean-constrained
// - When sel=0, is_write_memory_value can still be set to 1
// - This makes sel_read_memory = 1 (via derived constraint)
// - This fires the #[READ_MEM] permutation from a ghost row
//
// REQUIRED FIX:
// Gate by sel to avoid ghost rows triggering memory reads.
// sel_read_memory = sel * is_write_memory_value * (1 - error_out_of_bounds);

// This test verifies that the fix for the ghost row injection vulnerability works.
// The constraint `is_write_memory_value * (1 - sel) = 0` should prevent ghost rows
// from setting is_write_memory_value=1 when sel=0.
TEST(EmitPublicLogConstrainingTest, NegativeGhostRowInjectionBlocked)
{
    TestTraceContainer trace;
    MemoryTraceBuilder memory_trace_builder;
    PrecomputedTraceBuilder precomputed_trace_builder;

    uint32_t malicious_clk = 42;
    uint16_t malicious_space_id = 1;
    MemoryAddress malicious_log_addr = 0xDEAD;
    FF malicious_value = 0x1337;
    MemoryTag malicious_tag = MemoryTag::FF;

    std::vector<simulation::MemoryEvent> mem_events = {
        {
            .execution_clk = malicious_clk,
            .mode = simulation::MemoryMode::READ,
            .addr = malicious_log_addr,
            .value = MemoryValue::from<FF>(malicious_value),
            .space_id = malicious_space_id,
        },
    };

    precomputed_trace_builder.process_sel_range_8(trace);
    precomputed_trace_builder.process_sel_range_16(trace);
    precomputed_trace_builder.process_misc(trace, 1 << 16);
    precomputed_trace_builder.process_tag_parameters(trace);
    memory_trace_builder.process(mem_events, trace);

    uint32_t memory_row = 0;
    for (uint32_t row = 0; row < trace.get_num_rows(); row++) {
        if (trace.get(C::memory_sel, row) == 1) {
            memory_row = row;
            break;
        }
    }

    // Attempt ghost row injection: sel=0 but is_write_memory_value=1
    uint32_t ghost_row = 0;
    trace.set(ghost_row,
              std::vector<std::pair<Column, FF>>{
                  { C::precomputed_first_row, 1 },
                  { C::execution_clk, ghost_row },
                  { C::precomputed_zero, 0 },
                  { C::emit_public_log_sel, 0 },
                  { C::emit_public_log_is_write_memory_value, 1 },
                  { C::emit_public_log_error_out_of_bounds, 0 },
                  { C::emit_public_log_sel_read_memory, 1 },
                  { C::emit_public_log_execution_clk, malicious_clk },
                  { C::emit_public_log_space_id, malicious_space_id },
                  { C::emit_public_log_log_address, malicious_log_addr },
                  { C::emit_public_log_value, malicious_value },
                  { C::emit_public_log_tag, static_cast<uint8_t>(malicious_tag) },
                  { C::emit_public_log_public_inputs_value, malicious_value },
              });

    trace.set(C::memory_sel_public_log_read, memory_row, 1);

    // The fix: sel_read_memory = sel * is_write_memory_value * (1 - error_out_of_bounds)
    // Gating by sel should cause the relation check to fail
    // because sel_read_memory=1 and sel=0 violates this constraint
    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace),
                              emit_public_log::get_subrelation_label(
                                  emit_public_log::SR_SEL_SHOULD_READ_MEMORY_IS_SEL_AND_WRITE_MEM_AND_NO_ERR));
}

TEST(EmitPublicLogConstrainingTest, NegativeSelToggledAtStartEnd)
{
    // Constraint: (start + end) * (1 - sel) = 0
    // If start=1, sel must be 1.
    TestTraceContainer trace = TestTraceContainer({ {
        { C::emit_public_log_sel, 1 },
        { C::emit_public_log_start, 1 },
    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_SEL_ON_START_OR_END);

    trace.set(C::emit_public_log_sel, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_SEL_ON_START_OR_END),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_SEL_ON_START_OR_END));
}

TEST(EmitPublicLogConstrainingTest, NegativeInitialSeenWrongTag)
{
    // Constraint: start * seen_wrong_tag = 0
    // At start=1, seen_wrong_tag must be 0.
    TestTraceContainer trace = TestTraceContainer({ {
        { C::emit_public_log_sel, 1 },
        { C::emit_public_log_start, 1 },
        { C::emit_public_log_seen_wrong_tag, 0 },
    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_INITIAL_SEEN_WRONG_TAG);

    trace.set(C::emit_public_log_seen_wrong_tag, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_INITIAL_SEEN_WRONG_TAG),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_INITIAL_SEEN_WRONG_TAG));
}

TEST(EmitPublicLogConstrainingTest, NegativeCheckEndTagMismatch)
{
    // Constraint: end * (error_tag_mismatch - seen_wrong_tag) = 0
    // At end=1, error_tag_mismatch must equal seen_wrong_tag.
    TestTraceContainer trace = TestTraceContainer({ {
        { C::emit_public_log_sel, 1 },
        { C::emit_public_log_end, 1 },
        { C::emit_public_log_error_tag_mismatch, 1 },
        { C::emit_public_log_seen_wrong_tag, 1 },
    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_CHECK_END_TAG_MISMATCH);

    trace.set(C::emit_public_log_error_tag_mismatch, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_CHECK_END_TAG_MISMATCH),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_CHECK_END_TAG_MISMATCH));
}

TEST(EmitPublicLogConstrainingTest, NegativeWriteContractAddressAfterStart)
{
    // Constraint: is_write_contract_address' = start (global, not gated by sel)
    // Row 1's is_write_contract_address must equal row 0's start.
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_start, 1 },
                                                    },
                                                    {
                                                        { C::emit_public_log_is_write_contract_address, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_WRITE_CONTRACT_ADDRESS_AFTER_START);

    trace.set(C::emit_public_log_is_write_contract_address, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_public_log>(trace, emit_public_log::SR_WRITE_CONTRACT_ADDRESS_AFTER_START),
        emit_public_log::get_subrelation_label(emit_public_log::SR_WRITE_CONTRACT_ADDRESS_AFTER_START));
}

TEST(EmitPublicLogConstrainingTest, NegativeSetAndProgateValueWrite)
{
    // Constraint: NOT_END * (is_write_memory_value + is_write_contract_address - is_write_memory_value') = 0
    // When sel=1 and end=0: is_write_memory_value' = is_write_memory_value + is_write_contract_address
    TestTraceContainer trace = TestTraceContainer({ {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_is_write_contract_address, 1 },
                                                        { C::emit_public_log_is_write_memory_value, 0 },
                                                    },
                                                    {
                                                        { C::emit_public_log_sel, 1 },
                                                        { C::emit_public_log_end, 1 },
                                                        { C::emit_public_log_is_write_memory_value, 1 },
                                                    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_SET_AND_PROGATE_VALUE_WRITE);

    trace.set(C::emit_public_log_is_write_memory_value, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_SET_AND_PROGATE_VALUE_WRITE),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_SET_AND_PROGATE_VALUE_WRITE));
}

TEST(EmitPublicLogConstrainingTest, NegativeDisabledMemReadValueZero)
{
    // Constraint: (sel - sel_read_memory) * value = 0
    // When memory read is disabled (sel=1, sel_read_memory=0), value must be 0.
    TestTraceContainer trace = TestTraceContainer({ {
        { C::emit_public_log_sel, 1 },
        { C::emit_public_log_sel_read_memory, 0 },
        { C::emit_public_log_value, 0 },
    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_DISABLED_MEM_READ_VALUE_ZERO);

    trace.set(C::emit_public_log_value, 0, 42);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_DISABLED_MEM_READ_VALUE_ZERO),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_DISABLED_MEM_READ_VALUE_ZERO));
}

TEST(EmitPublicLogConstrainingTest, NegativeDisabledMemReadTagFF)
{
    // Constraint: (sel - sel_read_memory) * (MEM_TAG_FF - tag) = 0
    // When memory read is disabled (sel=1, sel_read_memory=0), tag must be MEM_TAG_FF (0).
    TestTraceContainer trace = TestTraceContainer({ {
        { C::emit_public_log_sel, 1 },
        { C::emit_public_log_sel_read_memory, 0 },
        { C::emit_public_log_tag, 0 },
    } });

    check_relation<emit_public_log>(trace, emit_public_log::SR_DISABLED_MEM_READ_TAG_FF);

    trace.set(C::emit_public_log_tag, 0, 3);

    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_public_log>(trace, emit_public_log::SR_DISABLED_MEM_READ_TAG_FF),
                              emit_public_log::get_subrelation_label(emit_public_log::SR_DISABLED_MEM_READ_TAG_FF));
}

} // namespace

} // namespace bb::avm2::constraining
