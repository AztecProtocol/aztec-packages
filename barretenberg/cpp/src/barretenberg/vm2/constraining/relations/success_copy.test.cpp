#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
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

TEST(SuccessCopyConstrainingTest, SuccessCopyTrue)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_execute_success_copy, 1 },
          { C::execution_register_0_, /*true=*/1 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U1) },
          { C::execution_last_child_success, /*true=*/1 } },
    });
    check_relation<execution>(trace, execution::SR_SUCCESS_COPY_WRITE_REG, execution::SR_SUCCESS_COPY_U1_TAG);
}

TEST(SuccessCopyConstrainingTest, SuccessCopyFalse)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_execute_success_copy, 1 },
          { C::execution_register_0_, /*false=*/0 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U1) },
          { C::execution_last_child_success, /*false=*/0 } },
    });
    check_relation<execution>(trace, execution::SR_SUCCESS_COPY_WRITE_REG, execution::SR_SUCCESS_COPY_U1_TAG);
}

TEST(SuccessCopyConstrainingTest, NegativeInvalidMemTag)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_execute_success_copy, 1 },
          { C::execution_register_0_, /*true=*/1 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U16) },
          { C::execution_last_child_success, 1 } },
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_SUCCESS_COPY_U1_TAG),
                              "SUCCESS_COPY_U1_TAG");
}

TEST(SuccessCopyConstrainingTest, NegativeInvalidLastChildSuccess)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_execute_success_copy, 1 },
          { C::execution_register_0_, /*false=*/0 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U1) },
          { C::execution_last_child_success, /*true=*/1 } },
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_SUCCESS_COPY_WRITE_REG),
                              "SUCCESS_COPY_WRITE_REG");
}

} // namespace
} // namespace bb::avm2::constraining
