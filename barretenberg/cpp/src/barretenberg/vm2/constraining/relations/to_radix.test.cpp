#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix.hpp"
#include "barretenberg/vm2/simulation/to_radix.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using tracegen::ToRadixTraceBuilder;

using FF = AvmFlavorSettings::FF;
using C = Column;
using to_radix = bb::avm2::to_radix<FF>;
using ToRadixSimulator = simulation::ToRadix;

using simulation::EventEmitter;
using simulation::ToRadixEvent;

TEST(ToRadixConstrainingTest, EmptyRow)
{
    check_relation<to_radix>(testing::empty_trace());
}

TEST(ToRadixConstrainingTest, ToLeBitsBasicTest)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    auto bits = to_radix_simulator.to_le_bits(FF::one(), 254);

    EXPECT_EQ(bits.size(), 254);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 254);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeBitsPMinusOne)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    auto bits = to_radix_simulator.to_le_bits(FF::neg_one(), 254);

    EXPECT_EQ(bits.size(), 254);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 254);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeBitsShortest)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    auto bits = to_radix_simulator.to_le_bits(FF::one(), 1);

    EXPECT_EQ(bits.size(), 1);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 1);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeBitsPadded)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    auto bits = to_radix_simulator.to_le_bits(FF::one(), 500);

    EXPECT_EQ(bits.size(), 500);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 500);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixBasic)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    FF value = FF::one();
    auto bytes = to_radix_simulator.to_le_radix(value, 32, 256);

    auto expected_bytes = value.to_buffer();
    // to_buffer is BE
    std::reverse(expected_bytes.begin(), expected_bytes.end());
    EXPECT_EQ(bytes, expected_bytes);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 32);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixPMinusOne)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    FF value = FF::neg_one();
    auto bytes = to_radix_simulator.to_le_radix(value, 32, 256);

    auto expected_bytes = value.to_buffer();
    // to_buffer is BE
    std::reverse(expected_bytes.begin(), expected_bytes.end());
    EXPECT_EQ(bytes, expected_bytes);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 32);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixOneByte)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    auto bytes = to_radix_simulator.to_le_radix(FF::one(), 1, 256);

    std::vector<uint8_t> expected_bytes = { 1 };
    EXPECT_EQ(bytes, expected_bytes);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 1);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixPadded)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    FF value = FF::neg_one();
    auto bytes = to_radix_simulator.to_le_radix(value, 64, 256);

    auto expected_bytes = value.to_buffer();
    // to_buffer is BE
    std::reverse(expected_bytes.begin(), expected_bytes.end());
    expected_bytes.resize(64);
    EXPECT_EQ(bytes, expected_bytes);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    ToRadixTraceBuilder builder;
    builder.process(to_radix_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 64);
    check_relation<to_radix>(trace);
}

TEST(ToRadixConstrainingTest, ToLeBitsInteractions)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    to_radix_simulator.to_le_bits(FF::neg_one(), 254);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
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

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    to_radix_simulator.to_le_radix(FF::neg_one(), 32, 256);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
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
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
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

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    to_radix_simulator.to_le_radix(FF(256), 32, 256);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
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

} // namespace

} // namespace bb::avm2::constraining
