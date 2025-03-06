#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm/avm/trace/gadgets/range_check.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/lookups_to_radix.hpp"
#include "barretenberg/vm2/simulation/to_radix.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_p_decomposition.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using to_radix = bb::avm2::to_radix<FF>;
using ToRadixSimulator = simulation::ToRadix;
using simulation::EventEmitter;
using simulation::ToRadixEvent;
using tracegen::LookupIntoIndexedByClk;
using tracegen::LookupIntoPDecomposition;
using lookup_to_radix_limb_range = bb::avm2::lookup_to_radix_limb_range_relation<FF>;
using lookup_to_radix_limb_less_than_radix_range = bb::avm2::lookup_to_radix_limb_less_than_radix_range_relation<FF>;
using lookup_to_radix_safe_limbs_precomputed = bb::avm2::lookup_to_radix_safe_limbs_precomputed_relation<FF>;
using lookup_p_decomposition = bb::avm2::lookup_to_radix_p_decomposition_lookup_relation<FF>;
using lookup_limb_p_diff_range = bb::avm2::lookup_to_radix_limb_p_diff_range_relation<FF>;

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

    tracegen::ToRadixTraceBuilder builder;
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

    tracegen::ToRadixTraceBuilder builder;
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

    tracegen::ToRadixTraceBuilder builder;
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

    tracegen::ToRadixTraceBuilder builder;
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

    tracegen::ToRadixTraceBuilder builder;
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

    tracegen::ToRadixTraceBuilder builder;
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

    tracegen::ToRadixTraceBuilder builder;
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

    tracegen::ToRadixTraceBuilder builder;
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

    tracegen::ToRadixTraceBuilder to_radix_builder;
    to_radix_builder.process(to_radix_event_emitter.dump_events(), trace);
    tracegen::PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, 254);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_to_radix_safe_limbs(trace);
    precomputed_builder.process_to_radix_p_decompositions(trace);

    LookupIntoIndexedByClk<lookup_to_radix_limb_range::Settings>().process(trace);
    LookupIntoIndexedByClk<lookup_to_radix_limb_less_than_radix_range::Settings>().process(trace);
    LookupIntoIndexedByClk<lookup_to_radix_safe_limbs_precomputed::Settings>().process(trace);
    LookupIntoPDecomposition<lookup_p_decomposition::Settings>().process(trace);
    LookupIntoIndexedByClk<lookup_limb_p_diff_range::Settings>().process(trace);

    check_relation<to_radix>(trace);
    check_interaction<lookup_to_radix_limb_range>(trace);
    check_interaction<lookup_to_radix_limb_less_than_radix_range>(trace);
    check_interaction<lookup_to_radix_safe_limbs_precomputed>(trace);
    check_interaction<lookup_p_decomposition>(trace);
    check_interaction<lookup_limb_p_diff_range>(trace);
}

TEST(ToRadixConstrainingTest, ToLeRadixInteractions)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadixSimulator to_radix_simulator(to_radix_event_emitter);

    to_radix_simulator.to_le_radix(FF::neg_one(), 32, 256);

    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });

    tracegen::ToRadixTraceBuilder to_radix_builder;
    to_radix_builder.process(to_radix_event_emitter.dump_events(), trace);
    tracegen::PrecomputedTraceBuilder precomputed_builder;
    // There are a total of 10736 values in the decomposition of p trace, and this is the last radix
    precomputed_builder.process_misc(trace, 11000);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_to_radix_safe_limbs(trace);
    precomputed_builder.process_to_radix_p_decompositions(trace);

    LookupIntoIndexedByClk<lookup_to_radix_limb_range::Settings>().process(trace);
    LookupIntoIndexedByClk<lookup_to_radix_limb_less_than_radix_range::Settings>().process(trace);
    LookupIntoIndexedByClk<lookup_to_radix_safe_limbs_precomputed::Settings>().process(trace);
    LookupIntoPDecomposition<lookup_p_decomposition::Settings>().process(trace);
    LookupIntoIndexedByClk<lookup_limb_p_diff_range::Settings>().process(trace);

    check_relation<to_radix>(trace);
    check_interaction<lookup_to_radix_limb_range>(trace);
    check_interaction<lookup_to_radix_limb_less_than_radix_range>(trace);
    check_interaction<lookup_to_radix_safe_limbs_precomputed>(trace);
    check_interaction<lookup_p_decomposition>(trace);
    check_interaction<lookup_limb_p_diff_range>(trace);
}

} // namespace

} // namespace bb::avm2::constraining
