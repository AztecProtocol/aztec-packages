#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using simulation::AluOperation;
using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;

TEST(AluTraceGenTest, TraceGeneration)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint32_t>(1),
              .b = MemoryValue::from<uint32_t>(2),
              .c = MemoryValue::from<uint32_t>(3) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(R, alu_op, static_cast<uint8_t>(AluOperation::ADD)),
                          ROW_FIELD_EQ(R, alu_sel_op_add, 1),
                          ROW_FIELD_EQ(R, alu_ia, 1),
                          ROW_FIELD_EQ(R, alu_ib, 2),
                          ROW_FIELD_EQ(R, alu_ic, 3))));
}

} // namespace
} // namespace bb::avm2::tracegen
