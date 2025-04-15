#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/alu.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using alu = bb::avm2::alu<FF>;

TEST(AluConstrainingTest, BasicAdd)
{
    auto trace = TestTraceContainer::from_rows({
        { .alu_ia = 1, .alu_ib = 2, .alu_ic = 3, .alu_sel_op_add = 1 },
    });

    check_relation<alu>(trace);
}

TEST(AluConstrainingTest, NegativeSelNonBoolean)
{
    auto trace = TestTraceContainer::from_rows({
        // Negative test, this should be a boolean only!
        { .alu_sel_op_add = 23 },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace, alu::SR_SEL_ADD_BINARY), "SEL_ADD_BINARY");
}

TEST(AluConstrainingTest, NegativeAdd)
{
    auto trace = TestTraceContainer::from_rows({
        {
            // Wrong ADD.
            .alu_ia = 1,
            .alu_ib = 1,
            .alu_ic = 0,
            // Observe that I'm making subrelation SEL_ADD_BINARY fail too, but we'll only check subrelation ALU_ADD!
            .alu_sel_op_add = 1,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<alu>(trace, alu::SR_ALU_ADD), "ALU_ADD");
}

} // namespace
} // namespace bb::avm2::constraining
