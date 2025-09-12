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

TEST(ReturndataSizeConstrainingTest, SimpleTest)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_execute_returndata_size, 1 },
          { C::execution_register_0_, /*rd_size=*/10 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U32) },
          { C::execution_last_child_returndata_size, 10 } },
    });
    check_relation<execution>(trace, execution::SR_RETURNDATA_SIZE_WRITE_REG, execution::SR_RETURNDATA_SIZE_U32_TAG);
}

TEST(ReturndataSizeConstrainingTest, NegativeInvalidMemTag)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_execute_returndata_size, 1 },
          { C::execution_register_0_, 12345 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U64) },
          { C::execution_last_child_returndata_size, 12345 } },
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_RETURNDATA_SIZE_U32_TAG),
                              "RETURNDATA_SIZE_U32_TAG");
}

TEST(ReturndataSizeConstrainingTest, NegativeInvalidLastChildSuccess)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_execute_returndata_size, 1 },
          { C::execution_register_0_, /*rd_size=*/12345 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U32) },
          { C::execution_last_child_returndata_size, 10 } },
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_RETURNDATA_SIZE_WRITE_REG),
                              "RETURNDATA_SIZE_WRITE_REG");
}

} // namespace
} // namespace bb::avm2::constraining
