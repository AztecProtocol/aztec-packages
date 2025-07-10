#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/bitwise.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bitwise.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::BitwiseTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using bitwise = bb::avm2::bitwise<FF>;

using tracegen::PrecomputedTraceBuilder;

TEST(BitwiseConstrainingTest, EmptyRow)
{
    check_relation<bitwise>(testing::empty_trace());
}

// Testing a positive AND operation for each integral type (U1, U8, ... U128)
TEST(BitwiseConstrainingTest, AndWithTracegen)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;
    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from(uint1_t(1)),
          .b = MemoryValue::from(uint1_t(1)),
          .res = 1 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint8_t>(85),
          .b = MemoryValue::from<uint8_t>(175),
          .res = 5 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint16_t>(5323),
          .b = MemoryValue::from<uint16_t>(321),
          .res = 65 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint32_t>(13793),
          .b = MemoryValue::from<uint32_t>(10590617),
          .res = 4481 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint64_t>(0x7bff744e3cdf79LLU),
          .b = MemoryValue::from<uint64_t>(0x14ccccccccb6LLU),
          .res = 0x14444c0ccc30LLU },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint128_t>((uint128_t{ 0xb900000000000001 } << 64)),
          .b = MemoryValue::from<uint128_t>((uint128_t{ 0x1006021301080000 } << 64) +
                                            uint128_t{ 0x000000000000001080876844827 }),
          .res = uint128_t{ 0x1000000000000000 } << 64 }
    };

    builder.process(events, trace);

    EXPECT_EQ(trace.get_num_rows(), 33); // 33 = 1 + 1 + 1 + 2 + 4 + 8 + 16 (extra_shift_row U1 U8 U16 U32 U64 U128)
    check_relation<bitwise>(trace);
}

// Testing a positive OR operation for each integral type (U1, U8, ... U128)
TEST(BitwiseConstrainingTest, OrWithTracegen)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;
    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::OR,
          .a = MemoryValue::from(uint1_t(1)),
          .b = MemoryValue::from(uint1_t(0)),
          .res = 1 },
        { .operation = BitwiseOperation::OR,
          .a = MemoryValue::from<uint8_t>(128),
          .b = MemoryValue::from<uint8_t>(127),
          .res = 255 },
        { .operation = BitwiseOperation::OR,
          .a = MemoryValue::from<uint16_t>(5323),
          .b = MemoryValue::from<uint16_t>(321),
          .res = 5579 },
        { .operation = BitwiseOperation::OR,
          .a = MemoryValue::from<uint32_t>(13793),
          .b = MemoryValue::from<uint32_t>(10590617),
          .res = 10599929 },
        { .operation = BitwiseOperation::OR,
          .a = MemoryValue::from<uint64_t>(0x7bff744e3cdf79LLU),
          .b = MemoryValue::from<uint64_t>(0x14ccccccccb6LLU),
          .res = 0x7bfffccefcdfffLLU },
        { .operation = BitwiseOperation::OR,
          .a = MemoryValue::from<uint128_t>((uint128_t{ 0xb900000000000000 } << 64)),
          .b = MemoryValue::from<uint128_t>((uint128_t{ 0x1006021301080000 } << 64) +
                                            uint128_t{ 0x000000000000001080876844827 }),
          .res = (uint128_t{ 0xb906021301080000 } << 64) + uint128_t{ 0x0001080876844827 } },
    };

    builder.process(events, trace);

    EXPECT_EQ(trace.get_num_rows(), 33); // 33 = 1 + 1 + 1 + 2 + 4 + 8 + 16 (extra_shift_row U1 U8 U16 U32 U64 U128)
    check_relation<bitwise>(trace);
}

// Testing a positive XOR operation for each integral type (U1, U8, ... U128)
TEST(BitwiseConstrainingTest, XorWithTracegen)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from(uint1_t(1)),
          .b = MemoryValue::from(uint1_t(1)),
          .res = 0 },
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint8_t>(85),
          .b = MemoryValue::from<uint8_t>(175),
          .res = 250 },
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint16_t>(5323),
          .b = MemoryValue::from<uint16_t>(321),
          .res = 5514 },
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint32_t>(13793),
          .b = MemoryValue::from<uint32_t>(10590617),
          .res = 10595448 },
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint64_t>(0x7bff744e3cdf79LLU),
          .b = MemoryValue::from<uint64_t>(0x14ccccccccb6LLU),
          .res = 0x7bebb882f013cfLLU },
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint128_t>((uint128_t{ 0xb900000000000001 } << 64)),
          .b = MemoryValue::from<uint128_t>((uint128_t{ 0x1006021301080000 } << 64) +
                                            uint128_t{ 0x000000000000001080876844827 }),
          .res = (uint128_t{ 0xa906021301080001 } << 64) + uint128_t{ 0x0001080876844827 } },
    };

    builder.process(events, trace);

    EXPECT_EQ(trace.get_num_rows(), 33); // 33 = 1 + 1 + 1 + 2 + 4 + 8 + 16 (extra_shift_row U1 U8 U16 U32 U64 U128)
    check_relation<bitwise>(trace);
}

TEST(BitwiseConstrainingTest, MixedOperationsWithTracegen)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;
    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::OR,
          .a = MemoryValue::from(uint1_t(1)),
          .b = MemoryValue::from(uint1_t(0)),
          .res = 1 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint32_t>(13793),
          .b = MemoryValue::from<uint32_t>(10590617),
          .res = 4481 },
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint16_t>(5323),
          .b = MemoryValue::from<uint16_t>(321),
          .res = 5514 },
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint32_t>(13793),
          .b = MemoryValue::from<uint32_t>(10590617),
          .res = 10595448 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint8_t>(85),
          .b = MemoryValue::from<uint8_t>(175),
          .res = 5 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint8_t>(85),
          .b = MemoryValue::from<uint8_t>(175),
          .res = 5 },
    };

    builder.process(events, trace);

    EXPECT_EQ(trace.get_num_rows(), 14); // 14 = 1 + 3 * 1 + 1 * 2 + 2 * 4 (extra_shift_row + 2U1 + 1U8 + 1U16 + 2U32)
    check_relation<bitwise>(trace);
}

TEST(BitwiseConstrainingTest, NegativeWrongInit)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bitwise_acc_ia = 25,
            .bitwise_acc_ib = 25,
            .bitwise_acc_ic = 25,
            .bitwise_ia_byte = 25,
            .bitwise_ib_byte = 25,
            .bitwise_ic_byte = 25,
            .bitwise_last = 1,
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_INIT_A, bitwise::SR_BITW_INIT_B, bitwise::SR_BITW_INIT_C);

    trace.set(C::bitwise_ia_byte, 0, 24); // Mutate to wrong value violating BITW_INIT_A
    trace.set(C::bitwise_ib_byte, 0, 27); // Mutate to wrong value violating BITW_INIT_B
    trace.set(C::bitwise_ic_byte, 0, 28); // Mutate to wrong value violating BITW_INIT_C

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_INIT_A), "BITW_INIT_A");
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_INIT_B), "BITW_INIT_B");
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_INIT_C), "BITW_INIT_C");
}

TEST(BitwiseConstrainingTest, NegativeTruncateCtr)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bitwise_ctr = 4,
            .bitwise_sel = 1,
        },
        {
            .bitwise_ctr = 3,
            .bitwise_sel = 1,
        },
        {
            .bitwise_ctr = 2,
            .bitwise_sel = 1,
        },
        {
            .bitwise_ctr = 1,
            .bitwise_last = 1,
            .bitwise_sel = 1,
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_CTR_DECREMENT);

    trace.set(C::bitwise_ctr, 3, 0);
    trace.set(C::bitwise_last, 3, 0);
    trace.set(C::bitwise_sel, 3, 0);

    // Trace nows ends with bitwise_ctr == 2 without bitwise_last being set.
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_CTR_DECREMENT), "BITW_CTR_DECREMENT");
}

TEST(BitwiseConstrainingTest, NegativeGapCtr)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bitwise_ctr = 4,
            .bitwise_sel = 1,
        },
        {
            .bitwise_ctr = 3,
            .bitwise_last = 1,
            .bitwise_sel = 1,
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_CTR_DECREMENT);
    trace.set(C::bitwise_ctr, 1, 2); // Mutate to wrong value (ctr decreases from 4 to 2)
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_CTR_DECREMENT), "BITW_CTR_DECREMENT");
}

TEST(BitwiseConstrainingTest, NegativeLastSetBeforeEnd)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bitwise_ctr = 8,
            .bitwise_ctr_min_one_inv = FF(7).invert(),
            .bitwise_sel = 1,
        },
        {
            .bitwise_ctr = 7,
            .bitwise_ctr_min_one_inv = FF(6).invert(),
            .bitwise_sel = 1,

        },
        {
            .bitwise_ctr = 6,
            .bitwise_ctr_min_one_inv = FF(5).invert(),
            .bitwise_sel = 1,
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_LAST_FOR_CTR_ONE);
    trace.set(C::bitwise_last, 2, 1); // Mutate to wrong value (wrongly activate bitwise_last on last row)
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_LAST_FOR_CTR_ONE),
                              "BITW_LAST_FOR_CTR_ONE");
}

TEST(BitwiseConstrainingTest, NegativeDeactivateRow)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bitwise_ctr = 8,
            .bitwise_ctr_inv = FF(8).invert(),
            .bitwise_sel = 1,
        },
        {
            .bitwise_ctr = 7,
            .bitwise_ctr_inv = FF(7).invert(),
            .bitwise_sel = 1,
        },
        {
            .bitwise_ctr = 6,
            .bitwise_ctr_inv = FF(6).invert(),
            .bitwise_sel = 1,
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_SEL_CTR_NON_ZERO);
    trace.set(C::bitwise_sel, 1, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_SEL_CTR_NON_ZERO),
                              "BITW_SEL_CTR_NON_ZERO");
}

TEST(BitwiseConstrainingTest, NegativeChangeOpIDBeforeEnd)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bitwise_op_id = static_cast<uint8_t>(BitwiseOperation::XOR),
        },
        {
            .bitwise_op_id = static_cast<uint8_t>(BitwiseOperation::XOR),
        },
        {
            .bitwise_last = 1,
            .bitwise_op_id = static_cast<uint8_t>(BitwiseOperation::XOR),
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_OP_ID_REL);
    trace.set(C::bitwise_op_id, 1, static_cast<uint8_t>(BitwiseOperation::AND)); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_OP_ID_REL), "BITW_OP_ID_REL");
}

TEST(BitwiseConstrainingTest, NegativeWrongAccumulation)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bitwise_acc_ia = 0xaa11,
            .bitwise_acc_ib = 0xbb22,
            .bitwise_acc_ic = 0xcc33,
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

    check_relation<bitwise>(trace, bitwise::SR_BITW_ACC_REL_A, bitwise::SR_BITW_ACC_REL_B, bitwise::SR_BITW_ACC_REL_C);

    trace.set(C::bitwise_acc_ia, 0, 0xaa1f); // Mutate to wrong value violating BITW_ACC_REL_A
    trace.set(C::bitwise_acc_ib, 0, 0xbb2f); // Mutate to wrong value violating BITW_ACC_REL_B
    trace.set(C::bitwise_acc_ic, 0, 0xcc3f); // Mutate to wrong value violating BITW_ACC_REL_C

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_ACC_REL_A), "BITW_ACC_REL_A");
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_ACC_REL_B), "BITW_ACC_REL_B");
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_ACC_REL_C), "BITW_ACC_REL_C");
}

TEST(BitwiseConstrainingTest, MixedOperationsInteractions)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;
    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::OR,
          .a = MemoryValue::from(uint1_t(1)),
          .b = MemoryValue::from(uint1_t(0)),
          .res = 1 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint32_t>(13793),
          .b = MemoryValue::from<uint32_t>(10590617),
          .res = 4481 },
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint16_t>(5323),
          .b = MemoryValue::from<uint16_t>(321),
          .res = 5514 },
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint32_t>(13793),
          .b = MemoryValue::from<uint32_t>(10590617),
          .res = 10595448 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint8_t>(85),
          .b = MemoryValue::from<uint8_t>(175),
          .res = 5 },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint8_t>(85),
          .b = MemoryValue::from<uint8_t>(175),
          .res = 5 },
    };

    builder.process(events, trace);

    precomputed_builder.process_misc(trace, 256 * 256 * 3);
    precomputed_builder.process_bitwise(trace);
    precomputed_builder.process_tag_parameters(trace);

    check_all_interactions<BitwiseTraceBuilder>(trace);
    check_relation<bitwise>(trace);
}

TEST(BitwiseConstrainingTest, BitwiseExecInteraction)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({ {
        // Bitwise Entry
        .bitwise_acc_ia = 0x01,
        .bitwise_acc_ib = 0x01,
        .bitwise_acc_ic = 0x00,
        .bitwise_err = 1,
        .bitwise_op_id = static_cast<uint8_t>(BitwiseOperation::AND),
        .bitwise_sel = 1,
        .bitwise_tag_a = static_cast<uint8_t>(ValueTag::FF),
        .bitwise_tag_b = static_cast<uint8_t>(ValueTag::U8),
        .bitwise_tag_c = static_cast<uint8_t>(ValueTag::U8),

        // Execution Entry
        .execution_mem_tag_reg_0_ = static_cast<uint8_t>(ValueTag::FF),
        .execution_mem_tag_reg_1_ = static_cast<uint8_t>(ValueTag::U8),
        .execution_mem_tag_reg_2_ = static_cast<uint8_t>(ValueTag::U8),
        .execution_register_0_ = 0x01,
        .execution_register_1_ = 0x01,
        .execution_register_2_ = 0x00,
        .execution_sel_bitwise = 1,
        .execution_sel_opcode_error = 1,
        .execution_subtrace_operation_id = static_cast<uint8_t>(BitwiseOperation::AND),
    } });

    check_interaction<BitwiseTraceBuilder, lookup_bitwise_dispatch_exec_bitwise_settings>(trace);
}

TEST(BitwiseConstrainingTest, InvalidBitwiseExecInteraction)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({ {
        // Bitwise Entry
        .bitwise_acc_ia = 0x01,
        .bitwise_acc_ib = 0x01,
        .bitwise_acc_ic = 0x00,
        .bitwise_op_id = static_cast<uint8_t>(BitwiseOperation::AND),
        .bitwise_sel = 1,
        .bitwise_tag_a = static_cast<uint8_t>(ValueTag::U8),
        .bitwise_tag_b = static_cast<uint8_t>(ValueTag::U8),
        .bitwise_tag_c = static_cast<uint8_t>(ValueTag::U8),

        // Execution Entry
        .execution_mem_tag_reg_0_ = static_cast<uint8_t>(ValueTag::U8),
        .execution_mem_tag_reg_1_ = static_cast<uint8_t>(ValueTag::U16), // Mismatch
        .execution_mem_tag_reg_2_ = static_cast<uint8_t>(ValueTag::U8),
        .execution_register_0_ = 0x01,
        .execution_register_1_ = 0x01,
        .execution_register_2_ = 0x00,
        .execution_sel_bitwise = 1,
        .execution_subtrace_operation_id = static_cast<uint8_t>(BitwiseOperation::AND),
    } });

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BitwiseTraceBuilder, lookup_bitwise_dispatch_exec_bitwise_settings>(trace)),
        "Failed.*BITWISE_DISPATCH_EXEC_BITWISE. Could not find tuple in destination.");
}

TEST(BitwiseConstrainingTest, ErrorHandlingInputFF)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from_tag(ValueTag::FF, 1),
          .b = MemoryValue::from_tag(ValueTag::FF, 1),
          .res = 0 },
    };
    builder.process(events, trace);
    precomputed_builder.process_bitwise(trace);
    precomputed_builder.process_tag_parameters(trace);

    check_relation<bitwise>(trace);
}

TEST(BitwiseConstrainingTest, ErrorHandlingInputTagMismatch)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from_tag(ValueTag::U8, 1),
          .b = MemoryValue::from_tag(ValueTag::U16, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    check_relation<bitwise>(trace);
    check_all_interactions<BitwiseTraceBuilder>(trace);
}

TEST(BitwiseConstrainingTest, ErrorHandlingMultiple)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from_tag(ValueTag::FF, 1),
          .b = MemoryValue::from_tag(ValueTag::U32, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    check_relation<bitwise>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
