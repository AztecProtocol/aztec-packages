#include "barretenberg/vm2/simulation/alu.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"

namespace bb::avm2::simulation {

using ::testing::StrictMock;

namespace {

// TODO(MW): Add more simulation tests
TEST(AvmSimulationAluTest, Add)
{
    StrictMock<MockRangeCheck> range_check;

    EventEmitter<AluEvent> alu_event_emitter;
    Alu alu(range_check, alu_event_emitter);

    auto a = MemoryValue::from<uint32_t>(1);
    auto b = MemoryValue::from<uint32_t>(2);

    EXPECT_CALL(range_check, assert_range(3, /*num_bits=*/32));

    auto c = alu.add(a, b);

    EXPECT_EQ(c, MemoryValue::from<uint32_t>(3));
}

} // namespace
} // namespace bb::avm2::simulation
