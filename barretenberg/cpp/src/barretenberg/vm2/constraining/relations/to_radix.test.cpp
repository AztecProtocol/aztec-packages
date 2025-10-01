#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix_mem.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/to_radix.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::Return;
using ::testing::StrictMock;

using tracegen::GreaterThanTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::TestTraceContainer;
using tracegen::ToRadixTraceBuilder;

using FF = AvmFlavorSettings::FF;
using C = Column;
using to_radix = bb::avm2::to_radix<FF>;
using to_radix_mem = bb::avm2::to_radix_mem<FF>;
using ToRadixSimulator = simulation::ToRadix;

using simulation::EventEmitter;
using simulation::GreaterThan;
using simulation::GreaterThanEvent;
using simulation::MockExecutionIdManager;
using simulation::MockFieldGreaterThan;
using simulation::NoopEventEmitter;
using simulation::PureGreaterThan;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;
using simulation::ToRadixEvent;
using simulation::ToRadixMemoryEvent;

TEST(ToRadixConstrainingTest, EmptyRow)
{
    check_relation<to_radix>(testing::empty_trace());
}

TEST(ToRadixConstrainingTest, ToLeBitsBasicTest)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [bits, truncated] = to_radix_simulator.to_le_bits(FF::one(), 254);

    EXPECT_EQ(bits.size(), 254);
    EXPECT_FALSE(truncated);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 254);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeBitsPMinusOne)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [bits, truncated] = to_radix_simulator.to_le_bits(FF::neg_one(), 254);

    EXPECT_EQ(bits.size(), 254);
    EXPECT_FALSE(truncated);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 254);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeBitsShortest)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [bits, truncated] = to_radix_simulator.to_le_bits(FF::one(), 1);

    EXPECT_EQ(bits.size(), 1);
    EXPECT_FALSE(truncated);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 1);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeBitsPadded)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [bits, truncated] = to_radix_simulator.to_le_bits(FF::one(), 500);

    EXPECT_EQ(bits.size(), 500);
    EXPECT_FALSE(truncated);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 500);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixBasic)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    FF value = FF::one();
    auto [bytes, truncated] = to_radix_simulator.to_le_radix(value, 32, 256);

    auto expected_bytes = value.to_buffer();
    // to_buffer is BE
    std::reverse(expected_bytes.begin(), expected_bytes.end());
    EXPECT_EQ(bytes, expected_bytes);
    EXPECT_FALSE(truncated);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 32);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixPMinusOne)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    FF value = FF::neg_one();
    auto [bytes, truncated] = to_radix_simulator.to_le_radix(value, 32, 256);

    auto expected_bytes = value.to_buffer();
    // to_buffer is BE
    std::reverse(expected_bytes.begin(), expected_bytes.end());
    EXPECT_EQ(bytes, expected_bytes);
    EXPECT_FALSE(truncated);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 32);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixOneByte)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [bytes, truncated] = to_radix_simulator.to_le_radix(FF::one(), 1, 256);

    std::vector<uint8_t> expected_bytes = { 1 };
    EXPECT_EQ(bytes, expected_bytes);
    EXPECT_FALSE(truncated);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 1);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixPadded)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    FF value = FF::neg_one();
    auto [bytes, truncated] = to_radix_simulator.to_le_radix(value, 64, 256);

    auto expected_bytes = value.to_buffer();
    // to_buffer is BE
    std::reverse(expected_bytes.begin(), expected_bytes.end());
    expected_bytes.resize(64);
    EXPECT_EQ(bytes, expected_bytes);
    EXPECT_FALSE(truncated);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 64);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeBitsInteractions)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    to_radix_simulator.to_le_bits(FF::neg_one(), 254);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder to_radix_builder;
    to_radix_builder.process(to_radix_event_emitter.dump_events(), trace);
    tracegen::PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, 257);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_to_radix_safe_limbs(trace);
    precomputed_builder.process_to_radix_p_decompositions(trace);

    check_interaction<ToRadixTraceBuilder,
                      lookup_to_radix_limb_range_settings,
                      lookup_to_radix_limb_less_than_radix_range_settings,
                      lookup_to_radix_fetch_safe_limbs_settings,
                      lookup_to_radix_fetch_p_limb_settings,
                      lookup_to_radix_limb_p_diff_range_settings>(trace);

    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixInteractions)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    to_radix_simulator.to_le_radix(FF::neg_one(), 32, 256);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder to_radix_builder;
    to_radix_builder.process(to_radix_event_emitter.dump_events(), trace);
    tracegen::PrecomputedTraceBuilder precomputed_builder;

    precomputed_builder.process_misc(trace, 257);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_to_radix_safe_limbs(trace);
    precomputed_builder.process_to_radix_p_decompositions(trace);

    check_interaction<ToRadixTraceBuilder,
                      lookup_to_radix_limb_range_settings,
                      lookup_to_radix_limb_less_than_radix_range_settings,
                      lookup_to_radix_fetch_safe_limbs_settings,
                      lookup_to_radix_fetch_p_limb_settings,
                      lookup_to_radix_limb_p_diff_range_settings>(trace);

    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, NegativeOverflowCheck)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    std::vector<uint8_t> modulus_le_bits(256, 0);
    for (size_t i = 0; i < 256; i++) {
        modulus_le_bits[i] = static_cast<uint8_t>(FF::modulus.get_bit(i));
    }

    ToRadixEvent event = { .value = FF::zero(), .radix = 2, .limbs = modulus_le_bits };
    std::vector<ToRadixEvent> events = { event };

    ToRadixTraceBuilder builder;
    builder.process(events, trace);

    EXPECT_THROW_WITH_MESSAGE(check_relation<to_radix>(trace, to_radix::SR_OVERFLOW_CHECK), "OVERFLOW_CHECK");
}

TEST(ToRadixConstrainingTest, NegativeConsistency)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    to_radix_simulator.to_le_radix(FF(256), 32, 256);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);

    // Disable the selector in the middle
    trace.set(Column::to_radix_sel, 6, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<to_radix>(trace, to_radix::SR_SELECTOR_CONSISTENCY),
                              "SELECTOR_CONSISTENCY");

    // Mutate the radix
    trace.set(Column::to_radix_radix, 5, 200);

    EXPECT_THROW_WITH_MESSAGE(check_relation<to_radix>(trace, to_radix::SR_CONSTANT_CONSISTENCY_RADIX),
                              "CONSTANT_CONSISTENCY_RADIX");

    // Mutate the value
    trace.set(Column::to_radix_value, 4, 27);

    EXPECT_THROW_WITH_MESSAGE(check_relation<to_radix>(trace, to_radix::SR_CONSTANT_CONSISTENCY_VALUE),
                              "CONSTANT_CONSISTENCY_VALUE");

    // Mutate the safe_limbs
    trace.set(Column::to_radix_safe_limbs, 3, 200);

    EXPECT_THROW_WITH_MESSAGE(check_relation<to_radix>(trace, to_radix::SR_CONSTANT_CONSISTENCY_SAFE_LIMBS),
                              "CONSTANT_CONSISTENCY_SAFE_LIMBS");
}

/////////////////////////
// ToRadix Memory Tests
/////////////////////////

TEST(ToRadixMemoryConstrainingTest, EmptyRow)
{
    check_relation<to_radix_mem>(testing::empty_trace());
}

TEST(ToRadixMemoryConstrainingTest, BasicTest)
{
    // Values
    FF value = FF(1337);
    uint32_t radix = 10;
    uint32_t num_limbs = 4;
    uint32_t dst_addr = 10;

    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            { C::precomputed_first_row, 1 },
            // GT check - Dst > AVM_HIGHEST_MEM_ADDRESS = false
            { C::gt_sel, 1 },
            { C::gt_input_a, dst_addr + num_limbs - 1 },
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 0 }, // GT should return true
            // Execution Trace (No gas)
            { C::execution_sel, 1 },
            { C::execution_sel_execute_to_radix, 1 },
            { C::execution_register_0_, value },
            { C::execution_register_1_, radix },
            { C::execution_register_2_, num_limbs },
            { C::execution_register_3_, 0 }, // is_output_bits
            { C::execution_rop_4_, dst_addr },

        },
        // Row 1
        {
            // To Radix Mem
            { C::to_radix_mem_sel, 1 },
            { C::to_radix_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
            { C::to_radix_mem_two, 2 },
            { C::to_radix_mem_two_five_six, 256 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, dst_addr },
            { C::to_radix_mem_max_write_addr, dst_addr + num_limbs - 1 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs },
            { C::to_radix_mem_is_output_bits, 0 },
            // Control Flow
            { C::to_radix_mem_start, 1 },
            { C::to_radix_mem_num_limbs_minus_one_inv, num_limbs - 1 == 0 ? 0 : FF(num_limbs - 1).invert() },
            // Helpers
            { C::to_radix_mem_sel_num_limbs_is_zero, 0 },
            { C::to_radix_mem_num_limbs_inv, FF(num_limbs).invert() },
            { C::to_radix_mem_sel_value_is_zero, 0 },
            { C::to_radix_mem_value_inv, value.invert() },
            // Output
            { C::to_radix_mem_limb_value, 1 },
            { C::to_radix_mem_sel_should_decompose, 1 },
            { C::to_radix_mem_sel_should_write_mem, 1 },
            { C::to_radix_mem_limb_index_to_lookup, num_limbs - 1 },
            { C::to_radix_mem_value_found, 1 },
            { C::to_radix_mem_output_tag, static_cast<uint8_t>(MemoryTag::U8) },

            // GT check - 2 > radix = false
            { C::gt_sel, 1 },
            { C::gt_input_a, 2 },
            { C::gt_input_b, radix },
            { C::gt_res, 0 }, // GT should return false
        },
        // Row 2
        {
            { C::to_radix_mem_sel, 1 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, dst_addr + 1 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs - 1 },
            { C::to_radix_mem_is_output_bits, 0 },
            // Control Flow
            // num_limbs_minus_one = (num_limbs - 1) - 1)
            { C::to_radix_mem_num_limbs_minus_one_inv, FF(num_limbs - 2).invert() },
            // Output
            { C::to_radix_mem_limb_value, 3 },
            { C::to_radix_mem_sel_should_decompose, 1 },
            { C::to_radix_mem_sel_should_write_mem, 1 },
            { C::to_radix_mem_limb_index_to_lookup, num_limbs - 2 },
            { C::to_radix_mem_output_tag, static_cast<uint8_t>(MemoryTag::U8) },
            // GT check - Radix > 256 = false
            { C::gt_sel, 1 },
            { C::gt_input_a, radix },
            { C::gt_input_b, 256 },
            { C::gt_res, 0 }, // GT should return false
        },
        // Row 3
        {
            { C::to_radix_mem_sel, 1 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, dst_addr + 2 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs - 2 },
            { C::to_radix_mem_is_output_bits, 0 },
            // Control Flow
            // num_limbs_minus_one = (num_limbs - 2) - 1)
            { C::to_radix_mem_num_limbs_minus_one_inv, FF(num_limbs - 3).invert() },
            // Output
            { C::to_radix_mem_limb_value, 3 },
            { C::to_radix_mem_sel_should_decompose, 1 },
            { C::to_radix_mem_sel_should_write_mem, 1 },
            { C::to_radix_mem_limb_index_to_lookup, num_limbs - 3 },
            { C::to_radix_mem_output_tag, static_cast<uint8_t>(MemoryTag::U8) },
        },
        // Row 4
        {
            { C::to_radix_mem_sel, 1 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, 13 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs - 3 },
            { C::to_radix_mem_is_output_bits, 0 },
            // Control Flow
            { C::to_radix_mem_last, 1 },
            // Output
            { C::to_radix_mem_limb_value, 7 },
            { C::to_radix_mem_sel_should_decompose, 1 },
            { C::to_radix_mem_sel_should_write_mem, 1 },
            { C::to_radix_mem_limb_index_to_lookup, num_limbs - 4 },
            { C::to_radix_mem_output_tag, static_cast<uint8_t>(MemoryTag::U8) },
        },
    });

    // Set the memory values and addresses
    MemoryAddress value_addr = 0xdeadbeef;
    MemoryAddress radix_addr = 0x12345678;
    MemoryAddress num_limbs_addr = 0xc0ffee;
    MemoryAddress is_output_bits_addr = 0xfeedface;

    std::vector<std::pair<MemoryAddress, MemoryValue>> memory_values = {
        { value_addr, MemoryValue::from<FF>(value) },
        { radix_addr, MemoryValue::from<uint32_t>(radix) },
        { num_limbs_addr, MemoryValue::from<uint32_t>(num_limbs) },
        { is_output_bits_addr, MemoryValue::from<uint1_t>(false) },
        { dst_addr, MemoryValue::from<uint8_t>(1) },
        { dst_addr + 1, MemoryValue::from<uint8_t>(3) },
        { dst_addr + 2, MemoryValue::from<uint8_t>(3) },
        { dst_addr + 3, MemoryValue::from<uint8_t>(7) },
    };

    for (uint32_t i = 0; i < memory_values.size(); ++i) {
        const auto& [addr, value] = memory_values[i];
        trace.set(i,
                  {
                      { { C::memory_sel, 1 },
                        { C::memory_space_id, 0 },
                        { C::memory_address, addr },
                        { C::memory_value, value.as_ff() },
                        { C::memory_tag, static_cast<uint8_t>(value.get_tag()) },
                        { C::memory_rw, i > 3 ? 1 : 0 } },
                  });
    }

    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    PureGreaterThan gt;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    // Generate the events for the to_radix subtrace
    to_radix_simulator.to_le_radix(value, num_limbs, radix);

    ToRadixTraceBuilder builder;
    auto events = to_radix_event_emitter.get_events();
    builder.process(to_radix_event_emitter.dump_events(), trace);

    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_to_radix_safe_limbs(trace);
    precomputed_builder.process_to_radix_p_decompositions(trace);
    precomputed_builder.process_misc(trace, 257); // Needed for precomputed safe limbs table

    check_relation<to_radix_mem>(trace);
    check_all_interactions<ToRadixTraceBuilder>(trace);

    // Negative test: disable memory write after the start row:
    trace.set(Column::to_radix_mem_sel_should_write_mem, 2, 0);
    EXPECT_THROW_WITH_MESSAGE((check_relation<to_radix_mem>(trace, to_radix_mem::SR_SEL_SHOULD_WRITE_MEM_CONTINUITY)),
                              "SEL_SHOULD_WRITE_MEM_CONTINUITY");

    // Negative test: disable decomposition after the start row:
    trace.set(Column::to_radix_mem_sel_should_decompose, 2, 0);
    EXPECT_THROW_WITH_MESSAGE((check_relation<to_radix_mem>(trace, to_radix_mem::SR_SEL_SHOULD_DECOMPOSE_CONTINUITY)),
                              "SEL_SHOULD_DECOMPOSE_CONTINUITY");
}

TEST(ToRadixMemoryConstrainingTest, DstOutOfRange)
{
    // Values
    FF value = FF(1337);
    uint32_t radix = 10;
    uint32_t num_limbs = 2;
    uint32_t dst_addr = static_cast<uint32_t>(AVM_HIGHEST_MEM_ADDRESS - 1); // This will cause an out-of-bounds error

    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            { C::precomputed_first_row, 1 },
            // GT check
            { C::gt_sel, 1 },
            { C::gt_input_a, dst_addr + num_limbs - 1 },
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 1 }, // GT should return true
        },
        // Row 1
        {
            // Execution Trace (No gas)
            { C::execution_sel, 1 },
            { C::execution_sel_execute_to_radix, 1 },
            { C::execution_register_0_, value },
            { C::execution_register_1_, radix },
            { C::execution_register_2_, num_limbs },
            { C::execution_register_3_, 0 }, // is_output_bits
            { C::execution_rop_4_, dst_addr },
            { C::execution_sel_opcode_error, 1 },

            // To Radix Mem
            { C::to_radix_mem_sel, 1 },
            { C::to_radix_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
            { C::to_radix_mem_two, 2 },
            { C::to_radix_mem_two_five_six, 256 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, dst_addr },
            { C::to_radix_mem_max_write_addr, dst_addr + num_limbs - 1 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs },
            { C::to_radix_mem_is_output_bits, 0 },
            // Errors
            { C::to_radix_mem_sel_dst_out_of_range_err, 1 },
            { C::to_radix_mem_input_validation_error, 1 },
            { C::to_radix_mem_err, 1 },
            // Control Flow
            { C::to_radix_mem_start, 1 },
            { C::to_radix_mem_last, 1 },
            { C::to_radix_mem_num_limbs_minus_one_inv, num_limbs - 1 == 0 ? 0 : FF(num_limbs - 1).invert() },
            // Helpers
            { C::to_radix_mem_sel_num_limbs_is_zero, 0 },
            { C::to_radix_mem_num_limbs_inv, FF(num_limbs).invert() },
            { C::to_radix_mem_sel_value_is_zero, 0 },
            { C::to_radix_mem_value_inv, value.invert() },
        },
    });

    check_relation<to_radix_mem>(trace);
    check_interaction<ToRadixTraceBuilder,
                      lookup_to_radix_mem_check_dst_addr_in_range_settings,
                      perm_to_radix_mem_dispatch_exec_to_radix_settings>(trace);
}

TEST(ToRadixMemoryConstrainingTest, InvalidRadix)
{
    // Values
    FF value = FF(1337);
    uint32_t radix = 0; // Invalid radix
    uint32_t num_limbs = 2;
    uint32_t dst_addr = 10;

    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            { C::precomputed_first_row, 1 },
            // GT check
            { C::gt_sel, 1 },
            { C::gt_input_a, 2 },
            { C::gt_input_b, radix },
            { C::gt_res, 1 }, // GT should return true
        },
        // Row 1
        {
            { C::to_radix_mem_sel, 1 },
            { C::to_radix_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
            { C::to_radix_mem_two, 2 },
            { C::to_radix_mem_two_five_six, 256 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, dst_addr },
            { C::to_radix_mem_max_write_addr, dst_addr + num_limbs - 1 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs },
            { C::to_radix_mem_is_output_bits, 0 },
            // Errors
            { C::to_radix_mem_sel_radix_lt_2_err, 1 },
            { C::to_radix_mem_input_validation_error, 1 },
            { C::to_radix_mem_err, 1 },
            // Control Flow
            { C::to_radix_mem_start, 1 },
            { C::to_radix_mem_last, 1 },
            { C::to_radix_mem_num_limbs_minus_one_inv, num_limbs - 1 == 0 ? 0 : FF(num_limbs - 1).invert() },
            // Helpers
            { C::to_radix_mem_sel_num_limbs_is_zero, 0 },
            { C::to_radix_mem_num_limbs_inv, FF(num_limbs).invert() },
            { C::to_radix_mem_sel_value_is_zero, 0 },
            { C::to_radix_mem_value_inv, value.invert() },
        },
    });
    check_relation<to_radix_mem>(trace);
    check_interaction<ToRadixTraceBuilder, lookup_to_radix_mem_check_radix_lt_2_settings>(trace);
}

TEST(ToRadixMemoryConstrainingTest, InvalidBitwiseRadix)
{
    // Values
    FF value = FF(1337);
    uint32_t radix = 3; // Invalid radix since is_output_bits is true
    uint32_t num_limbs = 2;
    uint32_t dst_addr = 10;
    bool is_output_bits = true;

    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            { C::precomputed_first_row, 1 },
            // GT check
            { C::gt_sel, 1 },
            { C::gt_input_a, 2 },
            { C::gt_input_b, radix },
            { C::gt_res, 0 }, // GT should return false
        },
        // Row 1
        {
            { C::to_radix_mem_sel, 1 },
            { C::to_radix_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
            { C::to_radix_mem_two, 2 },
            { C::to_radix_mem_two_five_six, 256 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, dst_addr },
            { C::to_radix_mem_max_write_addr, dst_addr + num_limbs - 1 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs },
            { C::to_radix_mem_is_output_bits, is_output_bits ? 1 : 0 },
            // Errors
            { C::to_radix_mem_sel_invalid_bitwise_radix, 1 }, // Invalid bitwise radix
            { C::to_radix_mem_input_validation_error, 1 },
            { C::to_radix_mem_err, 1 },
            // Control Flow
            { C::to_radix_mem_start, 1 },
            { C::to_radix_mem_last, 1 },
            { C::to_radix_mem_num_limbs_minus_one_inv, num_limbs - 1 == 0 ? 0 : FF(num_limbs - 1).invert() },
            // Helpers
            { C::to_radix_mem_sel_num_limbs_is_zero, 0 },
            { C::to_radix_mem_num_limbs_inv, FF(num_limbs).invert() },
            { C::to_radix_mem_sel_value_is_zero, 0 },
            { C::to_radix_mem_value_inv, value.invert() },
        },
    });
    check_relation<to_radix_mem>(trace);
    check_interaction<ToRadixTraceBuilder, lookup_to_radix_mem_check_radix_lt_2_settings>(trace);
}

TEST(ToRadixMemoryConstrainingTest, InvalidNumLimbsForValue)
{
    // Values
    FF value = FF(1337);
    uint32_t radix = 3;
    uint32_t num_limbs = 0; // num limbs should not be 0 if value != 0
    uint32_t dst_addr = 10;
    bool is_output_bits = false;

    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            { C::precomputed_first_row, 1 },
            // GT check
            { C::gt_sel, 1 },
            { C::gt_input_a, 2 },
            { C::gt_input_b, radix },
            { C::gt_res, 0 }, // GT should return false
        },
        // Row 1
        {
            { C::to_radix_mem_sel, 1 },
            { C::to_radix_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
            { C::to_radix_mem_two, 2 },
            { C::to_radix_mem_two_five_six, 256 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, dst_addr },
            { C::to_radix_mem_max_write_addr, dst_addr + num_limbs - 1 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs },
            { C::to_radix_mem_is_output_bits, is_output_bits ? 1 : 0 },
            // Errors
            { C::to_radix_mem_sel_invalid_num_limbs_err, 1 }, // num_limbs should not be 0 if value != 0
            { C::to_radix_mem_input_validation_error, 1 },
            { C::to_radix_mem_err, 1 },
            // Control Flow
            { C::to_radix_mem_start, 1 },
            { C::to_radix_mem_last, 1 },
            { C::to_radix_mem_num_limbs_minus_one_inv, num_limbs - 1 == 0 ? 0 : FF(num_limbs - 1).invert() },
            // Helpers
            { C::to_radix_mem_sel_num_limbs_is_zero, 1 }, // num limbs is zero
            { C::to_radix_mem_num_limbs_inv, 0 },
            { C::to_radix_mem_sel_value_is_zero, 0 },
            { C::to_radix_mem_value_inv, value.invert() },
        },
    });
    check_relation<to_radix_mem>(trace);
    check_interaction<ToRadixTraceBuilder, lookup_to_radix_mem_check_radix_lt_2_settings>(trace);
}

TEST(ToRadixMemoryConstrainingTest, TruncationError)
{
    // Values
    FF value = FF(1337);
    uint32_t radix = 10;
    uint32_t num_limbs = 3;
    uint32_t dst_addr = 10;
    bool is_output_bits = false;

    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            { C::precomputed_first_row, 1 },
            // GT check
            { C::gt_sel, 1 },
            { C::gt_input_a, 2 },
            { C::gt_input_b, radix },
            { C::gt_res, 0 }, // GT should return false
        },
        // Row 1
        {
            { C::to_radix_mem_sel, 1 },
            { C::to_radix_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
            { C::to_radix_mem_two, 2 },
            { C::to_radix_mem_two_five_six, 256 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, dst_addr },
            { C::to_radix_mem_max_write_addr, dst_addr + num_limbs - 1 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs },
            { C::to_radix_mem_is_output_bits, is_output_bits ? 1 : 0 },
            // Errors
            { C::to_radix_mem_sel_truncation_error, 1 }, // found = false on the last le limb
            { C::to_radix_mem_err, 1 },
            // Control Flow
            { C::to_radix_mem_start, 1 },
            { C::to_radix_mem_last, 1 },
            { C::to_radix_mem_num_limbs_minus_one_inv, num_limbs - 1 == 0 ? 0 : FF(num_limbs - 1).invert() },
            // Decomposition
            { C::to_radix_mem_sel_should_decompose, 1 },
            { C::to_radix_mem_limb_index_to_lookup, num_limbs - 1 },
            { C::to_radix_mem_limb_value, 3 },
            { C::to_radix_mem_value_found, 0 },
            // Helpers
            { C::to_radix_mem_num_limbs_inv, FF(num_limbs).invert() },
            { C::to_radix_mem_sel_value_is_zero, 0 },
            { C::to_radix_mem_value_inv, value.invert() },
        },
    });
    check_relation<to_radix_mem>(trace);
    check_interaction<ToRadixTraceBuilder, lookup_to_radix_mem_check_radix_lt_2_settings>(trace);

    // Negative test: truncation error should be on if found = false on the start row
    trace.set(C::to_radix_mem_sel_truncation_error, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<to_radix_mem>(trace, to_radix_mem::SR_TRUNCATION_ERROR),
                              "TRUNCATION_ERROR");
    trace.set(C::to_radix_mem_sel_truncation_error, 1, 1);

    // Negative test: truncation error can't be on if found = true on the start row
    trace.set(C::to_radix_mem_value_found, 1, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<to_radix_mem>(trace, to_radix_mem::SR_TRUNCATION_ERROR),
                              "TRUNCATION_ERROR");
}

TEST(ToRadixMemoryConstrainingTest, ZeroNumLimbsAndZeroValueIsNoop)
{
    // Values
    FF value = FF(0);
    uint32_t radix = 3;
    uint32_t num_limbs = 0; // num limbs can be zero since value is zero
    uint32_t dst_addr = 10;
    bool is_output_bits = false;

    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            { C::precomputed_first_row, 1 },
            // GT check
            { C::gt_sel, 1 },
            { C::gt_input_a, 2 },
            { C::gt_input_b, radix },
            { C::gt_res, 0 }, // GT should return false
        },
        // Row 1
        {
            { C::to_radix_mem_sel, 1 },
            { C::to_radix_mem_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
            { C::to_radix_mem_two, 2 },
            { C::to_radix_mem_two_five_six, 256 },
            // Memory Inputs
            { C::to_radix_mem_execution_clk, 0 },
            { C::to_radix_mem_space_id, 0 },
            { C::to_radix_mem_dst_addr, dst_addr },
            { C::to_radix_mem_max_write_addr, dst_addr + num_limbs - 1 },
            // To Radix Inputs
            { C::to_radix_mem_value_to_decompose, value },
            { C::to_radix_mem_radix, radix },
            { C::to_radix_mem_num_limbs, num_limbs },
            { C::to_radix_mem_is_output_bits, is_output_bits ? 1 : 0 },
            // Control Flow
            { C::to_radix_mem_start, 1 },
            { C::to_radix_mem_last, 1 },
            { C::to_radix_mem_num_limbs_minus_one_inv, num_limbs - 1 == 0 ? 0 : FF(num_limbs - 1).invert() },
            // Helpers
            { C::to_radix_mem_sel_num_limbs_is_zero, 1 }, // num limbs is zero
            { C::to_radix_mem_num_limbs_inv, 0 },
            { C::to_radix_mem_sel_value_is_zero, 1 },
            { C::to_radix_mem_value_inv, 0 },
        },
    });
    check_relation<to_radix_mem>(trace);
    check_interaction<ToRadixTraceBuilder, lookup_to_radix_mem_check_radix_lt_2_settings>(trace);
}

TEST(ToRadixMemoryConstrainingTest, ComplexTest)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    EventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;
    EventEmitter<RangeCheckEvent> range_check_emitter;
    EventEmitter<GreaterThanEvent> gt_emitter;

    simulation::MemoryStore memory;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockFieldGreaterThan> field_gt;
    RangeCheck range_check(range_check_emitter);
    GreaterThan gt(field_gt, range_check, gt_emitter);
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0)).WillOnce(Return(1));
    ToRadixSimulator to_radix_simulator(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    FF value = FF::neg_one();
    uint32_t radix = 2;
    uint32_t num_limbs = 256;
    MemoryAddress dst_addr = 10;
    bool is_output_bits = true;
    // Two calls to test transitions between contiguous chunks of computation
    to_radix_simulator.to_be_radix(memory, value, radix, num_limbs, is_output_bits, dst_addr);
    to_radix_simulator.to_be_radix(
        memory, /*value=*/FF(1337), /*radix=*/10, /*num_limbs=*/6, /*is_output_bits=*/false, /*dst_addr=*/0xdeadbeef);

    TestTraceContainer trace;
    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    builder.process_with_memory(to_radix_mem_event_emitter.dump_events(), trace);

    GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_emitter.dump_events(), trace);

    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_to_radix_safe_limbs(trace);
    precomputed_builder.process_to_radix_p_decompositions(trace);
    precomputed_builder.process_misc(trace, 257); // Needed for precomputed safe limbs table

    check_relation<to_radix>(trace);
    check_relation<to_radix_mem>(trace);
    // Skip the memory writes
    check_interaction<ToRadixTraceBuilder,
                      lookup_to_radix_limb_range_settings,
                      lookup_to_radix_limb_less_than_radix_range_settings,
                      lookup_to_radix_fetch_safe_limbs_settings,
                      lookup_to_radix_fetch_p_limb_settings,
                      lookup_to_radix_limb_p_diff_range_settings,
                      lookup_to_radix_mem_input_output_to_radix_settings,
                      lookup_to_radix_mem_check_dst_addr_in_range_settings,
                      lookup_to_radix_mem_check_radix_lt_2_settings,
                      lookup_to_radix_mem_check_radix_gt_256_settings,
                      lookup_to_radix_mem_input_output_to_radix_settings>(trace);
}

} // namespace

} // namespace bb::avm2::constraining
