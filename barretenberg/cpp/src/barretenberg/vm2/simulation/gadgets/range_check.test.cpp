#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"

namespace bb::avm2::simulation {
namespace {

using testing::ElementsAre;

TEST(RangeCheckSimulationTest, AssertRange)
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

    EXPECT_THAT(emitter.dump_events(), ElementsAre(expect_event));
}

} // namespace
} // namespace bb::avm2::simulation
