#include "barretenberg/vm2/simulation/alu.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"

namespace bb::avm2::simulation {
namespace {

TEST(AvmSimulationAluTest, Add)
{
    EventEmitter<AluEvent> alu_event_emitter;
    Alu alu(alu_event_emitter);

    ValueRefAndTag a = { .value = 1, .tag = MemoryTag::U32 };
    ValueRefAndTag b = { .value = 2, .tag = MemoryTag::U32 };

    FF c = alu.add(a, b);

    EXPECT_EQ(c, 3);
}

} // namespace
} // namespace bb::avm2::simulation
