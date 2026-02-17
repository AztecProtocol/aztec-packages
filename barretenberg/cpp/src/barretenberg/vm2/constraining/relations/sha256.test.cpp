#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sha256.hpp"
#include "barretenberg/vm2/generated/relations/sha256.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/lib/sha256_compression.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_bitwise.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/sha256_trace.hpp"
// Temporary imports, see comment in test.
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/sha256.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

// todo(ilyas): add negative tests

using ::testing::Return;
using ::testing::StrictMock;

using simulation::Bitwise;
using simulation::BitwiseEvent;
using simulation::DeduplicatingEventEmitter;
using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::GreaterThan;
using simulation::GreaterThanEvent;
using simulation::MemoryStore;
using simulation::MockExecutionIdManager;
using simulation::PureBitwise;
using simulation::PureGreaterThan;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;
using simulation::Sha256;
using simulation::Sha256CompressionEvent;

using tracegen::BitwiseTraceBuilder;
using tracegen::GreaterThanTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::Sha256TraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using sha256 = bb::avm2::sha256<FF>;
using sha256_mem = bb::avm2::sha256_mem<FF>;

TEST(Sha256ConstrainingTest, EmptyRow)
{
    check_relation<sha256>(testing::empty_trace());
    check_relation<sha256_mem>(testing::empty_trace());
}

// This test imports a bunch of external code since hand-generating the sha256 trace is a bit laborious atm.
// The test is a bit of a placeholder for now.
// TOOD: Replace this with a hardcoded test vector and write a negative test
TEST(Sha256ConstrainingTest, Basic)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));
    PureGreaterThan gt;
    PureBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }

    std::array<uint32_t, 16> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
    MemoryAddress input_addr = 8;
    for (uint32_t i = 0; i < 16; ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
    }
    MemoryAddress output_addr = 25;

    // We do two compression operations just to ensure the "after-latch" relations are correct
    sha256_gadget.compression(mem, state_addr, input_addr, output_addr);
    sha256_gadget.compression(mem, state_addr, input_addr, output_addr);
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);
    Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);

    check_relation<sha256>(trace);
}

TEST(Sha256ConstrainingTest, Interaction)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));
    EventEmitter<BitwiseEvent> bitwise_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<RangeCheckEvent> range_check_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);

    Bitwise bitwise(bitwise_event_emitter);

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }

    std::array<uint32_t, 16> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
    MemoryAddress input_addr = 8;
    for (uint32_t i = 0; i < 16; ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
    }
    MemoryAddress output_addr = 25;

    sha256_gadget.compression(mem, state_addr, input_addr, output_addr);

    TestTraceContainer trace;
    Sha256TraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 65);
    precomputed_builder.process_sha256_round_constants(trace);

    BitwiseTraceBuilder bitwise_builder;
    bitwise_builder.process(bitwise_event_emitter.dump_events(), trace);

    GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    builder.process(sha256_event_emitter.get_events(), trace);

    // Check bitwise and round constant lookups
    check_interaction<Sha256TraceBuilder,
                      lookup_sha256_round_constant_settings,
                      lookup_sha256_w_s_0_xor_0_settings,
                      lookup_sha256_w_s_0_xor_1_settings,
                      lookup_sha256_w_s_1_xor_0_settings,
                      lookup_sha256_w_s_1_xor_1_settings,
                      lookup_sha256_s_1_xor_0_settings,
                      lookup_sha256_s_1_xor_1_settings,
                      lookup_sha256_ch_and_0_settings,
                      lookup_sha256_ch_and_1_settings,
                      lookup_sha256_ch_xor_settings,
                      lookup_sha256_s_0_xor_0_settings,
                      lookup_sha256_s_0_xor_1_settings,
                      lookup_sha256_maj_and_0_settings,
                      lookup_sha256_maj_and_1_settings,
                      lookup_sha256_maj_and_2_settings,
                      lookup_sha256_maj_xor_0_settings,
                      lookup_sha256_maj_xor_1_settings,
                      lookup_sha256_range_rhs_w_7_settings,
                      lookup_sha256_range_rhs_w_18_settings,
                      lookup_sha256_range_rhs_w_3_settings,
                      lookup_sha256_range_rhs_w_17_settings,
                      lookup_sha256_range_rhs_w_19_settings,
                      lookup_sha256_range_rhs_w_10_settings,
                      lookup_sha256_range_rhs_e_6_settings,
                      lookup_sha256_range_rhs_e_11_settings,
                      lookup_sha256_range_rhs_e_25_settings,
                      lookup_sha256_range_rhs_a_2_settings,
                      lookup_sha256_range_rhs_a_13_settings,
                      lookup_sha256_range_rhs_a_22_settings,
                      lookup_sha256_range_comp_w_lhs_settings,
                      lookup_sha256_range_comp_w_rhs_settings,
                      lookup_sha256_range_comp_next_a_lhs_settings,
                      lookup_sha256_range_comp_next_a_rhs_settings,
                      lookup_sha256_range_comp_next_e_lhs_settings,
                      lookup_sha256_range_comp_next_e_rhs_settings,
                      lookup_sha256_range_comp_a_lhs_settings,
                      lookup_sha256_range_comp_a_rhs_settings,
                      lookup_sha256_range_comp_b_lhs_settings,
                      lookup_sha256_range_comp_b_rhs_settings,
                      lookup_sha256_range_comp_c_lhs_settings,
                      lookup_sha256_range_comp_c_rhs_settings,
                      lookup_sha256_range_comp_d_lhs_settings,
                      lookup_sha256_range_comp_d_rhs_settings,
                      lookup_sha256_range_comp_e_lhs_settings,
                      lookup_sha256_range_comp_e_rhs_settings,
                      lookup_sha256_range_comp_f_lhs_settings,
                      lookup_sha256_range_comp_f_rhs_settings,
                      lookup_sha256_range_comp_g_lhs_settings,
                      lookup_sha256_range_comp_g_rhs_settings,
                      lookup_sha256_range_comp_h_lhs_settings,
                      lookup_sha256_range_comp_h_rhs_settings>(trace);

    check_relation<sha256>(trace);
}

//////////////////////////////////////////
/// SHA256 Memory Constraining Test
//////////////////////////////////////////

TEST(Sha256MemoryConstrainingTest, Basic)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    PureBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }

    std::array<uint32_t, 16> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
    MemoryAddress input_addr = 8;
    for (uint32_t i = 0; i < 16; ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
    }
    MemoryAddress output_addr = 25;

    // We do two compression operations just to ensure the "after-latch" relations are correct
    sha256_gadget.compression(mem, state_addr, input_addr, output_addr);
    sha256_gadget.compression(mem, state_addr, input_addr, output_addr);
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_interaction<Sha256TraceBuilder,
                      lookup_sha256_mem_check_state_addr_in_range_settings,
                      lookup_sha256_mem_check_input_addr_in_range_settings,
                      lookup_sha256_mem_check_output_addr_in_range_settings>(trace);
}

TEST(Sha256MemoryConstrainingTest, SimpleOutOfRangeMemoryAddresses)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    PureBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    MemoryAddress state_addr = static_cast<MemoryAddress>(AVM_HIGHEST_MEM_ADDRESS - 6); // This will be out of range
    MemoryAddress input_addr = 8;
    MemoryAddress output_addr = 25;

    EXPECT_THROW_WITH_MESSAGE(sha256_gadget.compression(mem, state_addr, input_addr, output_addr),
                              ".*Memory address out of range.*");
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_interaction<Sha256TraceBuilder,
                      lookup_sha256_mem_check_state_addr_in_range_settings,
                      lookup_sha256_mem_check_input_addr_in_range_settings,
                      lookup_sha256_mem_check_output_addr_in_range_settings>(trace);
}

TEST(Sha256MemoryConstrainingTest, MultiOutOfRangeMemoryAddresses)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    PureBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    MemoryAddress state_addr = static_cast<MemoryAddress>(AVM_HIGHEST_MEM_ADDRESS - 6);   // This will be out of range
    MemoryAddress input_addr = static_cast<MemoryAddress>(AVM_HIGHEST_MEM_ADDRESS - 2);   // This will be out of range
    MemoryAddress output_addr = static_cast<MemoryAddress>(AVM_HIGHEST_MEM_ADDRESS - 20); // This will be out of range

    EXPECT_THROW_WITH_MESSAGE(sha256_gadget.compression(mem, state_addr, input_addr, output_addr),
                              ".*Memory address out of range.*");
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_interaction<Sha256TraceBuilder,
                      lookup_sha256_mem_check_state_addr_in_range_settings,
                      lookup_sha256_mem_check_input_addr_in_range_settings,
                      lookup_sha256_mem_check_output_addr_in_range_settings>(trace);
}

TEST(Sha256MemoryConstrainingTest, InvalidStateTagErr)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    PureBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    std::array<uint32_t, 7> state = { 0, 1, 2, 3, 4, 5, 6 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 7; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }
    // Add an invalid tag
    mem.set(state_addr + 7, MemoryValue::from<uint64_t>(7));

    MemoryAddress input_addr = 8;
    MemoryAddress output_addr = 25;

    EXPECT_THROW_WITH_MESSAGE(sha256_gadget.compression(mem, state_addr, input_addr, output_addr),
                              ".*Invalid tag for sha256 state values.*");
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_interaction<Sha256TraceBuilder,
                      lookup_sha256_mem_check_state_addr_in_range_settings,
                      lookup_sha256_mem_check_input_addr_in_range_settings,
                      lookup_sha256_mem_check_output_addr_in_range_settings>(trace);
}

TEST(Sha256MemoryConstrainingTest, InvalidInputTagErr)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    PureBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }

    std::array<uint32_t, 14> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 };
    MemoryAddress input_addr = 8;
    for (uint32_t i = 0; i < 14; ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
    }
    mem.set(input_addr + 14, MemoryValue::from<uint64_t>(14)); // Add an invalid tag
    mem.set(input_addr + 15, MemoryValue::from<uint64_t>(15)); // Add an invalid tag
    MemoryAddress output_addr = 25;

    EXPECT_THROW_WITH_MESSAGE(sha256_gadget.compression(mem, state_addr, input_addr, output_addr),
                              ".*Invalid tag for sha256 input values.*");
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);
    if (getenv("AVM_DEBUG") != nullptr) {
        InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_interaction<Sha256TraceBuilder,
                      lookup_sha256_mem_check_state_addr_in_range_settings,
                      lookup_sha256_mem_check_input_addr_in_range_settings,
                      lookup_sha256_mem_check_output_addr_in_range_settings>(trace);
}

TEST(Sha256MemoryConstrainingTest, PropagateError)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;
    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    PureBitwise bitwise;

    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    MemoryAddress state_addr = 0;
    MemoryAddress input_addr = 8;
    MemoryAddress output_addr = 25;

    // Set up execution trace
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            // First invocation fails
            { C::execution_sel, 1 },
            { C::execution_context_id, mem.get_space_id() },
            { C::execution_sel_exec_dispatch_sha256_compression, 1 },
            { C::execution_rop_0_, output_addr },
            { C::execution_rop_1_, state_addr },
            { C::execution_rop_2_, input_addr },
            { C::execution_sel_opcode_error, 1 },
        },
    });
    // Add the state values to memory and the memory trace
    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    for (uint32_t i = 0; i < state.size(); ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
        trace.set(i,
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_space_id, mem.get_space_id() },
                      { C::memory_address, state_addr + i },
                      { C::memory_value, state[i] },
                      { C::memory_tag, static_cast<uint8_t>(MemoryTag::U32) },
                  } });
    }

    // Add the input values to memory and the memory trace
    std::array<uint32_t, 13> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };
    for (uint32_t i = 0; i < input.size(); ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
        trace.set(i + state.size(),
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_space_id, mem.get_space_id() },
                      { C::memory_address, input_addr + i },
                      { C::memory_value, input[i] },
                      { C::memory_tag, static_cast<uint8_t>(MemoryTag::U32) },
                  } });
    }

    // Add a 14th input that has an invalid tag
    mem.set(input_addr + 13, MemoryValue::from<uint64_t>(13));
    trace.set(state.size() + input.size(),
              { {
                  { C::memory_sel, 1 },
                  { C::memory_space_id, mem.get_space_id() },
                  { C::memory_address, input_addr + 13 },
                  { C::memory_value, 13 },
                  { C::memory_tag, static_cast<uint8_t>(MemoryTag::U64) }, // Invalid tag
              } });

    EXPECT_THROW(sha256_gadget.compression(mem, state_addr, input_addr, output_addr),
                 std::runtime_error); // This will be out of range and throw an error

    Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);

    GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, 65); // Enough for round constants
    precomputed_builder.process_sha256_round_constants(trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_all_interactions<Sha256TraceBuilder>(trace);
}

TEST(Sha256MemoryConstrainingTest, Complex)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0)).WillOnce(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;
    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    EventEmitter<BitwiseEvent> bitwise_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    Bitwise bitwise(bitwise_event_emitter);

    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    MemoryAddress state_addr = 0;
    MemoryAddress input_addr = 8;
    MemoryAddress output_addr = 25;

    // Set up execution trace
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            // First invocation fails
            { C::execution_sel, 1 },
            { C::execution_context_id, mem.get_space_id() },
            { C::execution_sel_exec_dispatch_sha256_compression, 1 },
            { C::execution_rop_0_, static_cast<MemoryAddress>(AVM_HIGHEST_MEM_ADDRESS - 1) },
            { C::execution_rop_1_, state_addr },
            { C::execution_rop_2_, input_addr },
            { C::execution_sel_opcode_error, 1 },
        },
        {
            // Second invocation passes
            { C::execution_sel, 1 },
            { C::execution_context_id, mem.get_space_id() },
            { C::execution_sel_exec_dispatch_sha256_compression, 1 },
            { C::execution_rop_0_, output_addr },
            { C::execution_rop_1_, state_addr },
            { C::execution_rop_2_, input_addr },
        },
    });
    // Add the state values to memory and the memory trace
    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    for (uint32_t i = 0; i < state.size(); ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
        trace.set(i,
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_clk, 1 },
                      { C::memory_space_id, mem.get_space_id() },
                      { C::memory_address, state_addr + i },
                      { C::memory_value, state[i] },
                      { C::memory_tag, static_cast<uint8_t>(MemoryTag::U32) },
                  } });
    }

    // Add the input values to memory and the memory trace
    std::array<uint32_t, 16> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
    for (uint32_t i = 0; i < input.size(); ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
        trace.set(i + state.size(),
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_clk, 1 },
                      { C::memory_space_id, mem.get_space_id() },
                      { C::memory_address, input_addr + i },
                      { C::memory_value, input[i] },
                      { C::memory_tag, static_cast<uint8_t>(MemoryTag::U32) },
                  } });
    }

    // Compute the expected output and set it in memory
    std::array<uint32_t, 8> expected_output = simulation::sha256_block(state, input);
    for (uint32_t i = 0; i < expected_output.size(); ++i) {
        mem.set(output_addr + i, MemoryValue::from<uint32_t>(expected_output[i]));
        trace.set(i + state.size() + input.size(),
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_clk, 1 },
                      { C::memory_space_id, mem.get_space_id() },
                      { C::memory_address, output_addr + i },
                      { C::memory_value, expected_output[i] },
                      { C::memory_tag, static_cast<uint8_t>(MemoryTag::U32) },
                      { C::memory_rw, 1 }, // Write operations
                  } });
    }

    EXPECT_THROW(
        sha256_gadget.compression(mem, state_addr, input_addr, static_cast<MemoryAddress>(AVM_HIGHEST_MEM_ADDRESS - 1)),
        std::runtime_error);                                             // This will be out of range and throw an error
    sha256_gadget.compression(mem, state_addr, input_addr, output_addr); // This will succeed

    Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);

    GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, 65); // Enough for round constants
    precomputed_builder.process_sha256_round_constants(trace);

    BitwiseTraceBuilder bitwise_builder;
    bitwise_builder.process(bitwise_event_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_all_interactions<Sha256TraceBuilder>(trace);
}

//////////////////////////////////////////
/// Negative Tests - Constraint Verification
//////////////////////////////////////////

// This test verifies that input_addr IS properly constrained on non-start rows.
//
// The sha256_mem.pil file propagates execution_clk, space_id, output_addr, and input_addr
// using CONTINUITY_* constraints. The CONTINUITY_INPUT_ADDR constraint ensures that
// input_addr increments by 1 during input rounds (when sel_is_input_round=1) and stays
// constant otherwise. This prevents malicious provers from reading arbitrary memory.
//
// APPROACH: Generate a valid SHA256 trace, then tamper with input_addr on a non-start row.
// The CONTINUITY_INPUT_ADDR constraint should catch this tampering and cause relation check to fail.
TEST(Sha256MemoryConstrainingTest, InputAddrTamperingIsCaughtByConstraint)
{
    // Step 1: Generate a valid SHA256 compression trace using the actual simulation
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));
    PureGreaterThan gt;
    PureBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    // Set up valid memory for state and input
    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }

    std::array<uint32_t, 16> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
    MemoryAddress input_addr = 8; // Legitimate input address
    for (uint32_t i = 0; i < 16; ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
    }
    MemoryAddress output_addr = 25;

    // Execute SHA256 compression (this generates valid events)
    sha256_gadget.compression(mem, state_addr, input_addr, output_addr);

    // Build trace from events
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);
    Sha256TraceBuilder builder;
    builder.process(sha256_event_emitter.dump_events(), trace);

    // Step 2: Verify the trace is valid BEFORE tampering
    ASSERT_NO_THROW(check_relation<sha256_mem>(trace)) << "Trace should be valid before tampering";

    // Step 3: Tamper with input_addr on row 1 (a non-start input round)
    // The constraint should catch this because input_addr[1] must equal input_addr[0] + 1
    constexpr uint32_t MALICIOUS_ADDR = 9999;
    trace.set(C::sha256_input_addr, 1, MALICIOUS_ADDR);

    // Step 4: Verify the CONTINUITY_INPUT_ADDR constraint catches the tampering
    // The constraint enforces: input_addr' = input_addr + sel_is_input_round
    EXPECT_THROW_WITH_MESSAGE(check_relation<sha256_mem>(trace, sha256_mem::SR_CONTINUITY_INPUT_ADDR),
                              "CONTINUITY_INPUT_ADDR");
}

//////////////////////////////////////////
/// Negative Test - init_* Propagation Constraint (PROP-001)
//////////////////////////////////////////

// This test verifies that init_a through init_h are properly propagated across multi-row computation.
//
// BACKGROUND: SHA256 compression uses init_a-init_h values loaded from memory on row 0, and these
// values are used in the final output calculation (OUT_X = x + init_x) on the last row.
//
// The PROPAGATE_INIT_* constraints (sha256.pil lines 111-126) ensure that init values remain
// constant across all rounds. Without these constraints, a malicious prover could:
// 1. Set correct init_a on row 0 (to pass memory read constraint)
// 2. Set arbitrary init_a on later rows
// 3. Corrupt the final SHA256 output
//
// This test verifies that tampering with init_a is caught by the PROPAGATE_INIT_A constraint.
TEST(Sha256ConstrainingTest, InitStateTamperingIsCaughtByPropagationConstraint)
{
    // Generate a valid SHA256 compression trace
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));
    PureGreaterThan gt;
    PureBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    // Set up valid memory for state and input
    std::array<uint32_t, 8> state = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }

    std::array<uint32_t, 16> input = { 0x61626380, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x18 };
    MemoryAddress input_addr = 8;
    for (uint32_t i = 0; i < 16; ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
    }
    MemoryAddress output_addr = 25;

    sha256_gadget.compression(mem, state_addr, input_addr, output_addr);

    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);
    Sha256TraceBuilder builder;
    builder.process(sha256_event_emitter.dump_events(), trace);

    // Verify the trace is valid before tampering
    ASSERT_NO_THROW(check_relation<sha256>(trace));

    // Find a row where perform_round=1 (any round row works, but use row 1 for simplicity)
    // Row 0 is start, rows 1-64 are rounds with perform_round=1
    constexpr uint32_t TAMPER_ROW = 1;
    ASSERT_EQ(trace.get(C::sha256_perform_round, TAMPER_ROW), FF(1)) << "Row 1 should have perform_round=1";

    // Tamper with init_a on row 1 (making it different from row 0)
    FF original_init_a = trace.get(C::sha256_init_a, TAMPER_ROW);
    FF tampered_init_a = original_init_a + FF(0x12345678);
    trace.set(C::sha256_init_a, TAMPER_ROW, tampered_init_a);

    // The PROPAGATE_INIT_A constraint should catch this:
    // perform_round * (init_a' - init_a) = 0
    // On row 0: perform_round=1, init_a'=tampered, init_a=original -> constraint violated
    EXPECT_THROW_WITH_MESSAGE(check_relation<sha256>(trace, sha256::SR_PROPAGATE_INIT_A), "PROPAGATE_INIT_A");
}

} // namespace
} // namespace bb::avm2::constraining
