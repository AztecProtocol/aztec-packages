#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution = bb::avm2::execution<FF>;

TEST(CtrlFlowConstrainingTest, Jump)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_sel_jump, 1 },
            { C::execution_rop_0_, 120 },
        },
        { { C::execution_sel, 1 }, { C::execution_last, 1 }, { C::execution_pc, 120 } },
    });

    check_relation<execution>(trace, execution::SR_PC_NEXT_ROW_INT_CALL_JUMP);

    // Negative test: pc on next row is incorrect
    trace.set(C::execution_pc, 2, 121);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_PC_NEXT_ROW_INT_CALL_JUMP),
                              "PC_NEXT_ROW_INT_CALL_JUMP");
}

} // namespace
} // namespace bb::avm2::constraining
