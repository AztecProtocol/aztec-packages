#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/bitwise.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::BitwiseTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using bitwise = bb::avm2::bitwise<FF>;

TEST(BitwiseConstrainingTest, EmptyRow)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    check_relation<bitwise>(trace.as_rows());
}

// Testing a positive AND operation for each integral type (U1, U8, ... U128)
TEST(BitwiseConstrainingTest, AndWithTracegen)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    builder.process(
        {
            { .operation = BitwiseOperation::AND, .tag = MemoryTag::U1, .a = 1, .b = 1, .res = 1 },
            { .operation = BitwiseOperation::AND, .tag = MemoryTag::U8, .a = 85, .b = 175, .res = 5 },
            { .operation = BitwiseOperation::AND, .tag = MemoryTag::U16, .a = 5323, .b = 321, .res = 65 },
            { .operation = BitwiseOperation::AND, .tag = MemoryTag::U32, .a = 13793, .b = 10590617, .res = 4481 },
            { .operation = BitwiseOperation::AND,
              .tag = MemoryTag::U64,
              .a = 0x7bff744e3cdf79LLU,
              .b = 0x14ccccccccb6LLU,
              .res = 0x14444c0ccc30LLU },
            { .operation = BitwiseOperation::AND,
              .tag = MemoryTag::U128,
              .a = uint256_t::from_uint128(uint128_t{ 0xb900000000000001 } << 64),
              .b = uint256_t::from_uint128(uint128_t{ 0x1006021301080000 } << 64) +
                   uint128_t{ 0x000000000000001080876844827 },
              .res = uint256_t::from_uint128(uint128_t{ 0x1000000000000000 } << 64) },
        },
        trace);

    check_relation<bitwise>(trace.as_rows());
}

// Testing a positive OR operation for each integral type (U1, U8, ... U128)
TEST(BitwiseConstrainingTest, OrWithTracegen)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    builder.process(
        {
            { .operation = BitwiseOperation::OR, .tag = MemoryTag::U1, .a = 1, .b = 0, .res = 1 },
            { .operation = BitwiseOperation::OR, .tag = MemoryTag::U8, .a = 128, .b = 127, .res = 255 },
            { .operation = BitwiseOperation::OR, .tag = MemoryTag::U16, .a = 5323, .b = 321, .res = 5579 },
            { .operation = BitwiseOperation::OR, .tag = MemoryTag::U32, .a = 13793, .b = 10590617, .res = 10599929 },
            { .operation = BitwiseOperation::OR,
              .tag = MemoryTag::U64,
              .a = 0x7bff744e3cdf79LLU,
              .b = 0x14ccccccccb6LLU,
              .res = 0x7bfffccefcdfffLLU },
            { .operation = BitwiseOperation::OR,
              .tag = MemoryTag::U128,
              .a = uint256_t::from_uint128(uint128_t{ 0xb900000000000000 } << 64),
              .b = uint256_t::from_uint128(uint128_t{ 0x1006021301080000 } << 64) +
                   uint128_t{ 0x000000000000001080876844827 },
              .res = uint256_t::from_uint128(uint128_t{ 0xb906021301080000 } << 64) + uint128_t{ 0x0001080876844827 } },
        },
        trace);

    check_relation<bitwise>(trace.as_rows());
}

// Testing a positive XOR operation for each integral type (U1, U8, ... U128)
TEST(BitwiseConstrainingTest, XorWithTracegen)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    builder.process(
        {
            { .operation = BitwiseOperation::XOR, .tag = MemoryTag::U1, .a = 1, .b = 1, .res = 0 },
            { .operation = BitwiseOperation::XOR, .tag = MemoryTag::U8, .a = 85, .b = 175, .res = 250 },
            { .operation = BitwiseOperation::XOR, .tag = MemoryTag::U16, .a = 5323, .b = 321, .res = 5514 },
            { .operation = BitwiseOperation::XOR, .tag = MemoryTag::U32, .a = 13793, .b = 10590617, .res = 10595448 },
            { .operation = BitwiseOperation::XOR,
              .tag = MemoryTag::U64,
              .a = 0x7bff744e3cdf79LLU,
              .b = 0x14ccccccccb6LLU,
              .res = 0x7bebb882f013cfLLU },
            {
                .operation = BitwiseOperation::XOR,
                .tag = MemoryTag::U128,
                .a = uint256_t::from_uint128(uint128_t{ 0xb900000000000001 } << 64),
                .b = uint256_t::from_uint128((uint128_t{ 0x1006021301080000 } << 64) +
                                             uint128_t{ 0x000000000000001080876844827 }),
                .res =
                    uint256_t::from_uint128((uint128_t{ 0xa906021301080001 } << 64) + uint128_t{ 0x0001080876844827 }),
            },
        },
        trace);

    check_relation<bitwise>(trace.as_rows());
}

TEST(BitwiseConstrainingTest, mixedOperationsWithTracegen)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    builder.process(
        {
            { .operation = BitwiseOperation::OR, .tag = MemoryTag::U1, .a = 1, .b = 0, .res = 1 },
            { .operation = BitwiseOperation::AND, .tag = MemoryTag::U32, .a = 13793, .b = 10590617, .res = 4481 },
            { .operation = BitwiseOperation::XOR, .tag = MemoryTag::U16, .a = 5323, .b = 321, .res = 5514 },
            { .operation = BitwiseOperation::XOR, .tag = MemoryTag::U32, .a = 13793, .b = 10590617, .res = 10595448 },
            { .operation = BitwiseOperation::AND, .tag = MemoryTag::U8, .a = 85, .b = 175, .res = 5 },
            { .operation = BitwiseOperation::AND, .tag = MemoryTag::U8, .a = 85, .b = 175, .res = 5 },
        },
        trace);

    EXPECT_EQ(trace.get_num_rows(), 13); // 13 = 3 * 1 + 1 * 2 + 2 * 4 (2U1 + 1U8 + 1U16 + 2U32)
    check_relation<bitwise>(trace.as_rows());
}

TEST(BitwiseConstrainingTest, negativeWrongInit)
{
    TestTraceContainer::RowTraceContainer trace = {
        {
            .bitwise_acc_ia = 25,
            .bitwise_acc_ib = 25,
            .bitwise_acc_ic = 25,
            .bitwise_ia_byte = 24,
            .bitwise_ib_byte = 27,
            .bitwise_ic_byte = 28,
            .bitwise_last = 1,
        },
    };

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_INIT_A), "BITW_INIT_A");
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_INIT_B), "BITW_INIT_B");
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_INIT_C), "BITW_INIT_C");
}

TEST(BitwiseConstrainingTest, negativeTruncateCtr)
{
    TestTraceContainer test_container = TestTraceContainer::from_rows({
        {
            .bitwise_ctr = 4,
        },
        {
            .bitwise_ctr = 3,
        },
        {
            .bitwise_ctr = 2,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(test_container.as_rows(), bitwise::SR_BITW_CTR_DECREMENT),
                              "BITW_CTR_DECREMENT");
}

TEST(BitwiseConstrainingTest, negativeGapCtr)
{
    TestTraceContainer test_container = TestTraceContainer::from_rows({
        {
            .bitwise_ctr = 4,
        },
        {
            .bitwise_ctr = 2,
            .bitwise_last = 1,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(test_container.as_rows(), bitwise::SR_BITW_CTR_DECREMENT),
                              "BITW_CTR_DECREMENT");
}

TEST(BitwiseConstrainingTest, negativeLastSetBeforeEnd)
{
    TestTraceContainer test_container = TestTraceContainer::from_rows({
        {
            .bitwise_ctr = 8,
        },
        {
            .bitwise_ctr = 7,

        },
        {
            .bitwise_ctr = 6,
            .bitwise_last = 1,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(test_container.as_rows(), bitwise::SR_BITW_LAST_FOR_CTR_ONE),
                              "BITW_LAST_FOR_CTR_ONE");
}

TEST(BitwiseConstrainingTest, negativeDeactivateRow)
{
    TestTraceContainer test_container = TestTraceContainer::from_rows({
        {
            .bitwise_ctr = 8,
            .bitwise_sel = 1,
        },
        {
            .bitwise_ctr = 7,
            .bitwise_sel = 0,
        },
        {
            .bitwise_ctr = 6,
            .bitwise_sel = 1,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(test_container.as_rows(), bitwise::SR_BITW_SEL_CTR_NON_ZERO),
                              "BITW_SEL_CTR_NON_ZERO");
}

TEST(BitwiseConstrainingTest, negativeChangeOpIDBeforeEnd)
{
    TestTraceContainer test_container = TestTraceContainer::from_rows({
        {
            .bitwise_op_id = static_cast<uint8_t>(BitwiseOperation::XOR),
        },
        {
            .bitwise_op_id = static_cast<uint8_t>(BitwiseOperation::AND),
        },
        {
            .bitwise_last = 1,
            .bitwise_op_id = static_cast<uint8_t>(BitwiseOperation::XOR),
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(test_container.as_rows(), bitwise::SR_BITW_OP_ID_REL),
                              "BITW_OP_ID_REL");
}

TEST(BitwiseConstrainingTest, negativeWrongAccumulation)
{
    TestTraceContainer test_container = TestTraceContainer::from_rows({
        {
            .bitwise_acc_ia = 0xaa1f, // Correct: 0xaa11
            .bitwise_acc_ib = 0xbb2f, // Correct: 0xbb22
            .bitwise_acc_ic = 0xcc3f, // Correct: 0xcc33
            .bitwise_ia_byte = 0x11,
            .bitwise_ib_byte = 0x22,
            .bitwise_ic_byte = 0x33,
        },
        {
            .bitwise_acc_ia = 0xaa,
            .bitwise_acc_ib = 0xbb,
            .bitwise_acc_ic = 0xcc,
            .bitwise_last = 1,
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(test_container.as_rows(), bitwise::SR_BITW_ACC_REL_A),
                              "BITW_ACC_REL_A");
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(test_container.as_rows(), bitwise::SR_BITW_ACC_REL_B),
                              "BITW_ACC_REL_B");
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(test_container.as_rows(), bitwise::SR_BITW_ACC_REL_C),
                              "BITW_ACC_REL_C");
}

} // namespace
} // namespace bb::avm2::constraining