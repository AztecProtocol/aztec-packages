#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/full_row.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using simulation::AluOperation;
using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;
using FF = R::FF;

TEST(AvmTraceGenAluTest, TraceGeneration)
{
    TestTraceContainer trace;
    AluTraceBuilder builder;

    builder.process(
        {
            { .operation = AluOperation::ADD, .a_addr = 0, .b_addr = 1, .dst_addr = 2, .a = 1, .b = 2, .res = 3 },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(Field(&R::alu_op, static_cast<uint8_t>(AluOperation::ADD)),
                          Field(&R::alu_sel_op_add, 1),
                          Field(&R::alu_ia_addr, 0),
                          Field(&R::alu_ib_addr, 1),
                          Field(&R::alu_dst_addr, 2),
                          Field(&R::alu_ia, 1),
                          Field(&R::alu_ib, 2),
                          Field(&R::alu_ic, 3))));
}

} // namespace
} // namespace bb::avm2::tracegen