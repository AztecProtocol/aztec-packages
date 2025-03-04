#include "barretenberg/vm2/simulation/to_radix.hpp"

#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {
namespace {

TEST(AvmSimulationToRadixTest, BasicBits)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadix to_radix(to_radix_event_emitter);

    FF scalar = FF::one();

    auto bits = to_radix.to_le_bits(scalar, 254);

    std::vector<bool> expected_result(254, false);
    expected_result[0] = true;

    EXPECT_EQ(bits, expected_result);
}

} // namespace
} // namespace bb::avm2::simulation
