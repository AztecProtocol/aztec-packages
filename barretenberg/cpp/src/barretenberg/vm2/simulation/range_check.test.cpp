#include "barretenberg/vm2/simulation/range_check.hpp"

#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {
namespace {

TEST(AvmSimulationRangeCheckTest, AssertRange)
{
    EventEmitter<RangeCheckEvent> emitter;
    RangeCheck range_check(emitter);

    uint128_t value = 333;
    uint8_t num_bits = 100;
    range_check.assert_range(value, num_bits);

    RangeCheckEvent expect_event = {
        .value = value,
        .num_bits = num_bits,
    };

    std::vector<RangeCheckEvent> events = { expect_event };
    EXPECT_EQ(emitter.dump_events(), events);
}

} // namespace
} // namespace bb::avm2::simulation
