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

TEST(MovConstrainingTest, MovFF)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_sel_mov, 1 },
            { C::execution_register_0_, FF::modulus_minus_two },
            { C::execution_register_1_, FF::modulus_minus_two },
            { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
            { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
        },
    });

    check_relation<execution>(trace, execution::SR_MOV_SAME_VALUE, execution::SR_MOV_SAME_TAG);
}

class MovAnyTagTest : public ::testing::TestWithParam<MemoryTag> {};

TEST_P(MovAnyTagTest, MovAnyTag)
{
    const auto tag = GetParam();
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_sel_mov, 1 },
            { C::execution_register_0_, 1 },
            { C::execution_register_1_, 1 },
            { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(tag) },
            { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(tag) },
        },
    });

    check_relation<execution>(trace, execution::SR_MOV_SAME_VALUE, execution::SR_MOV_SAME_TAG);
}

INSTANTIATE_TEST_SUITE_P(
    MovConstrainingTest,
    MovAnyTagTest,
    ::testing::Values(
        MemoryTag::U1, MemoryTag::U8, MemoryTag::U16, MemoryTag::U32, MemoryTag::U64, MemoryTag::U128, MemoryTag::FF));

TEST(MovConstrainingTest, NegativeMovDifferentTag)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_sel_mov, 1 },
            { C::execution_register_0_, 17 },
            { C::execution_register_1_, 17 },
            { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U8) },
            { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U16) },
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_MOV_SAME_TAG), "MOV_SAME_TAG");
}

TEST(MovConstrainingTest, NegativeMovDifferentValue)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::execution_sel, 1 },
            { C::execution_sel_mov, 1 },
            { C::execution_register_0_, 17 },
            { C::execution_register_1_, 18 },
            { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U32) },
            { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U32) },
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_MOV_SAME_VALUE), "MOV_SAME_VALUE");
}

} // namespace
} // namespace bb::avm2::constraining
