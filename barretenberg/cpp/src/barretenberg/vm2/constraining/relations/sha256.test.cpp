#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sha256.hpp"
#include "barretenberg/vm2/generated/relations/sha256.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/fakes/fake_bitwise.hpp"
#include "barretenberg/vm2/simulation/testing/fakes/fake_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/sha256_trace.hpp"
// Temporary imports, see comment in test.
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/sha256.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;

using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::GreaterThan;
using simulation::GreaterThanEvent;
using simulation::MemoryStore;
using simulation::MockExecutionIdManager;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;
using simulation::Sha256;
using simulation::Sha256CompressionEvent;

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
}

// This test imports a bunch of external code since hand-generating the sha256 trace is a bit laborious atm.
// The test is a bit of a placeholder for now.
// TOOD: Replace this with a hardcoded test vector and write a negative test
TEST(Sha256ConstrainingTest, Basic)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));
    simulation::FakeGreaterThan gt;
    simulation::FakeBitwise bitwise;

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
    MemoryAddress dst_addr = 25;

    // We do two compression operations just to ensure the "after-latch" relations are correct
    sha256_gadget.compression(mem, state_addr, input_addr, dst_addr);
    sha256_gadget.compression(mem, state_addr, input_addr, dst_addr);
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);
    tracegen::Sha256TraceBuilder builder;

    const auto sha256_event_container = sha256_event_emitter.dump_events();
    info("Process sha256 events");
    builder.process(sha256_event_container, trace);
    info("Check sha256 trace");

    check_relation<sha256>(trace);
}

TEST(Sha256ConstrainingTest, Interaction)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));
    simulation::FakeGreaterThan gt;
    simulation::FakeBitwise bitwise;

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
    MemoryAddress dst_addr = 25;

    sha256_gadget.compression(mem, state_addr, input_addr, dst_addr);

    TestTraceContainer trace;
    Sha256TraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;
    // Build just enough clk rows for the lookup
    precomputed_builder.process_misc(trace, 65);
    precomputed_builder.process_sha256_round_constants(trace);

    builder.process(sha256_event_emitter.get_events(), trace);
    check_interaction<Sha256TraceBuilder, lookup_sha256_round_constant_settings>(trace);

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
    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    simulation::FakeBitwise bitwise;

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
    MemoryAddress dst_addr = 25;

    // We do two compression operations just to ensure the "after-latch" relations are correct
    sha256_gadget.compression(mem, state_addr, input_addr, dst_addr);
    sha256_gadget.compression(mem, state_addr, input_addr, dst_addr);
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    tracegen::Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_interaction<Sha256TraceBuilder,
                      lookup_sha256_mem_check_state_addr_in_range_settings,
                      lookup_sha256_mem_check_input_addr_in_range_settings,
                      lookup_sha256_mem_check_dst_addr_in_range_settings>(trace);
}

TEST(Sha256MemoryConstrainingTest, SimpleOutOfRangeMemoryAddresses)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    simulation::FakeBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    MemoryAddress state_addr = AVM_HIGHEST_MEM_ADDRESS - 6; // This will be out of range
    MemoryAddress input_addr = 8;
    MemoryAddress dst_addr = 25;

    EXPECT_THROW_WITH_MESSAGE(sha256_gadget.compression(mem, state_addr, input_addr, dst_addr),
                              ".*Memory address out of range.*");
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    tracegen::Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_interaction<Sha256TraceBuilder,
                      lookup_sha256_mem_check_state_addr_in_range_settings,
                      lookup_sha256_mem_check_input_addr_in_range_settings,
                      lookup_sha256_mem_check_dst_addr_in_range_settings>(trace);
}

TEST(Sha256MemoryConstrainingTest, MultiOutOfRangeMemoryAddresses)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    simulation::FakeBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    MemoryAddress state_addr = AVM_HIGHEST_MEM_ADDRESS - 6; // This will be out of range
    MemoryAddress input_addr = AVM_HIGHEST_MEM_ADDRESS - 2; // This will be out of range
    MemoryAddress dst_addr = AVM_HIGHEST_MEM_ADDRESS - 20;  // This will be out of range

    EXPECT_THROW_WITH_MESSAGE(sha256_gadget.compression(mem, state_addr, input_addr, dst_addr),
                              ".*Memory address out of range.*");
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    tracegen::Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<sha256_mem>(trace);
    check_relation<sha256>(trace);
    check_interaction<Sha256TraceBuilder,
                      lookup_sha256_mem_check_state_addr_in_range_settings,
                      lookup_sha256_mem_check_input_addr_in_range_settings,
                      lookup_sha256_mem_check_dst_addr_in_range_settings>(trace);
}

TEST(Sha256MemoryConstrainingTest, InvalidStateTagErr)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    simulation::FakeBitwise bitwise;

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
    MemoryAddress dst_addr = 25;

    EXPECT_THROW_WITH_MESSAGE(sha256_gadget.compression(mem, state_addr, input_addr, dst_addr),
                              ".*Invalid tag for sha256 state values.*");
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    tracegen::Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    tracegen::GreaterThanTraceBuilder gt_builder;
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
                      lookup_sha256_mem_check_dst_addr_in_range_settings>(trace);
}

TEST(Sha256MemoryConstrainingTest, InvalidInputTagErr)
{
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    simulation::FakeBitwise bitwise;

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise, gt, sha256_event_emitter);

    std::array<uint32_t, 8> state = { 0, 1, 2, 3, 4, 5, 6, 7 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }

    std::array<uint32_t, 15> input = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 };
    MemoryAddress input_addr = 8;
    for (uint32_t i = 0; i < 15; ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
    }
    mem.set(input_addr + 15, MemoryValue::from<uint64_t>(15)); // Add an invalid tag
    MemoryAddress dst_addr = 25;

    EXPECT_THROW_WITH_MESSAGE(sha256_gadget.compression(mem, state_addr, input_addr, dst_addr),
                              ".*Invalid tag for sha256 input values.*");
    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    tracegen::Sha256TraceBuilder builder;
    const auto sha256_event_container = sha256_event_emitter.dump_events();
    builder.process(sha256_event_container, trace);
    tracegen::GreaterThanTraceBuilder gt_builder;
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
                      lookup_sha256_mem_check_dst_addr_in_range_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
