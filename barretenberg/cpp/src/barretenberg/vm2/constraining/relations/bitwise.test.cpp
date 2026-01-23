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
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

// Imports for keccak/sha256 vulnerability exploit tests
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/keccakf1600.hpp"
#include "barretenberg/vm2/generated/relations/lookups_keccakf1600.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sha256.hpp"
#include "barretenberg/vm2/generated/relations/sha256.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/sha256.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_bitwise.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/testing/keccakf1600_fixture.test.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/shared_index_cache.hpp"
#include "barretenberg/vm2/tracegen/sha256_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::Return;
using ::testing::StrictMock;

using tracegen::BitwiseTraceBuilder;
using tracegen::ExecutionTraceBuilder;
using tracegen::KeccakF1600TraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::Sha256TraceBuilder;
using tracegen::TestTraceContainer;

using simulation::Bitwise;
using simulation::BitwiseEvent;
using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::GreaterThan;
using simulation::GreaterThanEvent;
using simulation::MemoryStore;
using simulation::MockExecutionIdManager;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;
using simulation::Sha256;
using simulation::Sha256CompressionEvent;

using FF = AvmFlavorSettings::FF;
using C = Column;
using bitwise = bb::avm2::bitwise<FF>;
using keccakf1600 = bb::avm2::keccakf1600<FF>;
using sha256_relation = bb::avm2::sha256<FF>;

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
    TestTraceContainer trace({
        {
            { C::bitwise_ia_byte, 25 },
            { C::bitwise_ib_byte, 25 },
            { C::bitwise_ic_byte, 25 },
            { C::bitwise_last, 1 },
            { C::bitwise_acc_ia, 25 },
            { C::bitwise_acc_ib, 25 },
            { C::bitwise_acc_ic, 25 },
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
    TestTraceContainer trace({
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 4 },
        },
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 3 },
        },
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 2 },
        },
        {
            { C::bitwise_last, 1 },
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 1 },
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
    TestTraceContainer trace({
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 4 },
        },
        {
            { C::bitwise_last, 1 },
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 3 },
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_CTR_DECREMENT);
    trace.set(C::bitwise_ctr, 1, 2); // Mutate to wrong value (ctr decreases from 4 to 2)
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_CTR_DECREMENT), "BITW_CTR_DECREMENT");
}

TEST(BitwiseConstrainingTest, NegativeLastSetBeforeEnd)
{
    TestTraceContainer trace({
        {
            { C::bitwise_ctr_min_one_inv, FF(7).invert() },
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 8 },
        },
        {
            { C::bitwise_ctr_min_one_inv, FF(6).invert() },
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 7 },

        },
        {
            { C::bitwise_ctr_min_one_inv, FF(5).invert() },
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 6 },
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_LAST_FOR_CTR_ONE);
    trace.set(C::bitwise_last, 2, 1); // Mutate to wrong value (wrongly activate bitwise_last on last row)
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_LAST_FOR_CTR_ONE),
                              "BITW_LAST_FOR_CTR_ONE");
}

TEST(BitwiseConstrainingTest, NegativeDeactivateRow)
{
    TestTraceContainer trace({
        {
            { C::bitwise_ctr_inv, FF(8).invert() },
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 8 },
        },
        {
            { C::bitwise_ctr_inv, FF(7).invert() },
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 7 },
        },
        {
            { C::bitwise_ctr_inv, FF(6).invert() },
            { C::bitwise_sel, 1 },
            { C::bitwise_ctr, 6 },
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_SEL_CTR_NON_ZERO);
    trace.set(C::bitwise_sel, 1, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_SEL_CTR_NON_ZERO),
                              "BITW_SEL_CTR_NON_ZERO");
}

TEST(BitwiseConstrainingTest, NegativeChangeOpIDBeforeEnd)
{
    TestTraceContainer trace({
        {
            { C::bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::XOR) },
        },
        {
            { C::bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::XOR) },
        },
        {
            { C::bitwise_last, 1 },
            { C::bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::XOR) },
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_OP_ID_REL);
    trace.set(C::bitwise_op_id, 1, static_cast<uint8_t>(BitwiseOperation::AND)); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_OP_ID_REL), "BITW_OP_ID_REL");
}

TEST(BitwiseConstrainingTest, NegativeWrongAccumulation)
{
    TestTraceContainer trace({
        {
            { C::bitwise_ia_byte, 0x11 },
            { C::bitwise_ib_byte, 0x22 },
            { C::bitwise_ic_byte, 0x33 },
            { C::bitwise_acc_ia, 0xaa11 },
            { C::bitwise_acc_ib, 0xbb22 },
            { C::bitwise_acc_ic, 0xcc33 },
        },
        {
            { C::bitwise_last, 1 },
            { C::bitwise_acc_ia, 0xaa },
            { C::bitwise_acc_ib, 0xbb },
            { C::bitwise_acc_ic, 0xcc },
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
    TestTraceContainer trace({ {
        // Bitwise Entry
        { C::bitwise_err, 1 },
        { C::bitwise_start, 1 },
        { C::bitwise_tag_a, static_cast<uint8_t>(MemoryTag::FF) },
        { C::bitwise_tag_b, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_acc_ia, 0x01 },
        { C::bitwise_tag_c, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_acc_ib, 0x01 },
        { C::bitwise_acc_ic, 0x00 },
        // Execution Entry
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND) },
        { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U8) },
        { C::execution_register_0_, 0x01 },
        { C::execution_register_1_, 0x01 },
        { C::execution_register_2_, 0x00 },
        { C::execution_sel_exec_dispatch_bitwise, 1 },
        { C::execution_sel_opcode_error, 1 },
        { C::execution_subtrace_operation_id, static_cast<uint8_t>(BitwiseOperation::AND) },
    } });

    check_interaction<ExecutionTraceBuilder, lookup_execution_dispatch_to_bitwise_settings>(trace);
}

TEST(BitwiseConstrainingTest, InvalidBitwiseExecInteraction)
{
    TestTraceContainer trace({ {
        // Bitwise Entry
        { C::bitwise_sel, 1 },
        { C::bitwise_acc_ib, 0x01 },
        { C::bitwise_acc_ia, 0x01 },
        { C::bitwise_tag_a, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_tag_b, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_acc_ic, 0x00 },
        { C::bitwise_tag_c, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_op_id, static_cast<uint8_t>(BitwiseOperation::AND) },

        // Execution Entry
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::U8) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U16) }, // Mismatch
        { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U8) },
        { C::execution_register_0_, 0x01 },
        { C::execution_register_1_, 0x01 },
        { C::execution_register_2_, 0x00 },
        { C::execution_sel_exec_dispatch_bitwise, 1 },
        { C::execution_subtrace_operation_id, static_cast<uint8_t>(BitwiseOperation::AND) },
    } });

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<ExecutionTraceBuilder, lookup_execution_dispatch_to_bitwise_settings>(trace)),
        "Failed.*EXECUTION_DISPATCH_TO_BITWISE. Could not find tuple in destination.");
}

TEST(BitwiseConstrainingTest, ErrorHandlingInputFF)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from_tag(MemoryTag::FF, 1),
          .b = MemoryValue::from_tag(MemoryTag::FF, 1),
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
          .a = MemoryValue::from_tag(MemoryTag::U8, 1),
          .b = MemoryValue::from_tag(MemoryTag::U16, 1),
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
          .a = MemoryValue::from_tag(MemoryTag::FF, 1),
          .b = MemoryValue::from_tag(MemoryTag::U32, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    check_relation<bitwise>(trace);
}

TEST(BitwiseConstrainingTest, ExecBitwiseDispatchOnErrorMismatch)
{
    // Bitwise operations on mismatch tags should error out and produce FF(0) result.
    MemoryValue a = MemoryValue::from_tag(MemoryTag::U16, 45486);
    MemoryValue b = MemoryValue::from_tag(MemoryTag::U8, 174);

    TestTraceContainer trace({ {
        // Execution Entry
        { C::execution_sel_exec_dispatch_bitwise, 1 },
        { C::execution_subtrace_operation_id, static_cast<uint8_t>(BitwiseOperation::AND) },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(a.get_tag()) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(b.get_tag()) },
        { C::execution_register_0_, a.as_ff() },
        { C::execution_register_1_, b.as_ff() },

        // Output is FF(0) due to error
        { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_register_2_, 0x00 },
        { C::execution_sel_opcode_error, 1 },
    } });

    std::vector<simulation::BitwiseEvent> event = { { .operation = BitwiseOperation::AND, .a = a, .b = b, .res = 0 } };

    BitwiseTraceBuilder builder;
    builder.process(event, trace);

    check_relation<bitwise>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_execution_dispatch_to_bitwise_settings>(trace);
}

TEST(BitwiseConstrainingTest, ExecBitwiseDispatchOnErrorFF)
{
    // Bitwise operations on FF tags should error out and produce FF(0) result.
    MemoryValue a =
        MemoryValue::from_tag(MemoryTag::FF, FF("0x1b7f6afaafbe72d6c3fc1bc92828a395341af3d33f805af83f06cbf0dcaca8a9"));
    MemoryValue b = MemoryValue::from_tag(MemoryTag::U64, 9873803468411284649ULL);

    TestTraceContainer trace({ {
        // Execution Entry
        { C::execution_sel_exec_dispatch_bitwise, 1 },
        { C::execution_subtrace_operation_id, static_cast<uint8_t>(BitwiseOperation::OR) },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(a.get_tag()) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(b.get_tag()) },
        { C::execution_register_0_, a.as_ff() },
        { C::execution_register_1_, b.as_ff() },

        // Output is FF(0) due to error
        { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_register_2_, 0x00 },
        { C::execution_sel_opcode_error, 1 },
    } });

    std::vector<simulation::BitwiseEvent> event = { { .operation = BitwiseOperation::OR, .a = a, .b = b, .res = 0 } };

    BitwiseTraceBuilder builder;
    builder.process(event, trace);

    check_relation<bitwise>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_execution_dispatch_to_bitwise_settings>(trace);
}

///////////////////////////
// Vulnerability Tests: Missing start * (1 - sel) = 0 constraint
///////////////////////////

// This test demonstrates a SECURITY VULNERABILITY in bitwise.pil:
// The `start_keccak` selector is not protected to only be active when `sel == 1`.
// A malicious prover can set start_keccak=1 on inactive rows (sel=0) and claim
// arbitrary XOR/AND results, bypassing all bitwise constraints.
//
// The fix is to add:
// #[BITW_START_ONLY_WHEN_SEL]
// (start_keccak + start_sha256) * (1 - sel) = 0;
//
// This is the same vulnerability class as poseidon2_hash.pil (fixed in that file).
TEST(BitwiseConstrainingTest, VulnerabilityStartKeccakWithoutSel)
{
    // Create a ghost row where start_keccak=1 but sel=0.
    // This represents a forged row that a malicious prover could create to
    // claim: state_in_00 XOR state_in_01 = FAKE_OUTPUT
    // without actually computing the XOR!
    FF fake_input_a = FF(0xAAAABBBBCCCCDDDDULL);
    FF fake_input_b = FF(0x1111222233334444ULL);
    FF fake_output = FF(0x999999999999ULL); // NOT the real XOR!

    TestTraceContainer trace({
        {
            // Ghost row: sel=0 but start_keccak=1 should be INVALID
            // However, all relation checks pass because they're conditioned on sel
            { C::bitwise_sel, 0 },
            { C::bitwise_start, 1 },
            { C::bitwise_start_keccak, 1 },
            // Error handling: trigger tag mismatch to get err=1, last=1
            // This avoids the #[INTEGRAL_TAG_LENGTH] lookup (sel_get_ctr=start*(1-err)=0)
            { C::bitwise_tag_a, FF(MEM_TAG_U64) }, // U64 = 5
            { C::bitwise_tag_b, FF(MEM_TAG_U32) }, // != tag_a, triggers mismatch
            { C::bitwise_sel_tag_mismatch_err, 1 },
            { C::bitwise_sel_tag_ff_err, 0 },
            { C::bitwise_err, 1 },
            { C::bitwise_last, 1 },
            { C::bitwise_sel_get_ctr, 0 }, // start*(1-err) = 1*0 = 0
            { C::bitwise_ctr, 0 },
            // Inverses for tag check constraints
            { C::bitwise_tag_a_inv, FF(MEM_TAG_U64).invert() },
            { C::bitwise_tag_ab_diff_inv, FF(MEM_TAG_U64 - MEM_TAG_U32).invert() },
            // FAKE XOR computation - not constrained when sel=0!
            { C::bitwise_op_id, FF(AVM_BITWISE_XOR_OP_ID) },
            { C::bitwise_acc_ia, fake_input_a },
            { C::bitwise_acc_ib, fake_input_b },
            { C::bitwise_acc_ic, fake_output }, // FAKE output!
                                                // INIT constraints require acc_* = *_byte when last=1
            { C::bitwise_ia_byte, fake_input_a },
            { C::bitwise_ib_byte, fake_input_b },
            { C::bitwise_ic_byte, fake_output },
            // tag_c unconstrained when err=1 (RES_TAG_SHOULD_MATCH_INPUT gated by (1-err))
            { C::bitwise_tag_c, 0 },
        },
    });

    // VULNERABILITY DEMONSTRATION:
    // All bitwise relation checks PASS even though this row has:
    // - start_keccak=1 (would be matched by keccak XOR lookups using bitwise.start_keccak as destination)
    // - Arbitrary acc_ic (fake XOR output, not enforced because sel=0 skips #[BYTE_OPERATIONS])
    //
    // This allows a prover to claim any XOR result for keccak permutation computations!
    // check_relation<bitwise>(trace) should pass if the vulnerability is not fixed.

    // Now that the vulnerability is fixed, we expect an error:
    EXPECT_THROW_WITH_MESSAGE((check_relation<bitwise>(trace)), "BITW_START_ONLY_WHEN_SEL");
}

// Same vulnerability but for start_sha256 (used by SHA256 compression lookups).
TEST(BitwiseConstrainingTest, VulnerabilityStartSha256WithoutSel)
{
    FF fake_input_a = FF(0xAABBCCDD);
    FF fake_input_b = FF(0x11223344);
    FF fake_output = FF(0x99999999); // NOT the real XOR!

    TestTraceContainer trace({
        {
            { C::bitwise_sel, 0 },
            { C::bitwise_start, 1 },
            { C::bitwise_start_sha256, 1 },
            { C::bitwise_tag_a, FF(MEM_TAG_U32) }, // SHA256 uses U32
            { C::bitwise_tag_b, FF(MEM_TAG_U8) },  // != tag_a, triggers mismatch
            { C::bitwise_sel_tag_mismatch_err, 1 },
            { C::bitwise_sel_tag_ff_err, 0 },
            { C::bitwise_err, 1 },
            { C::bitwise_last, 1 },
            { C::bitwise_sel_get_ctr, 0 },
            { C::bitwise_ctr, 0 },
            { C::bitwise_tag_a_inv, FF(MEM_TAG_U32).invert() },
            { C::bitwise_tag_ab_diff_inv, FF(MEM_TAG_U32 - MEM_TAG_U8).invert() },
            { C::bitwise_op_id, FF(AVM_BITWISE_XOR_OP_ID) },
            { C::bitwise_acc_ia, fake_input_a },
            { C::bitwise_acc_ib, fake_input_b },
            { C::bitwise_acc_ic, fake_output },
            { C::bitwise_ia_byte, fake_input_a },
            { C::bitwise_ib_byte, fake_input_b },
            { C::bitwise_ic_byte, fake_output },
            { C::bitwise_tag_c, 0 },
        },
    });

    // Now that the vulnerability is fixed, we expect an error:
    EXPECT_THROW_WITH_MESSAGE((check_relation<bitwise>(trace)), "BITW_START_ONLY_WHEN_SEL");
}

// This test demonstrates a full exploit: forging a keccak XOR result.
// It generates a valid keccak trace, mutates an intermediate XOR output to a fake value,
// and adds a ghost row in bitwise to satisfy the lookup.
// Both source (keccak) and destination (bitwise) pass check_relation, and the exploited
// lookup passes check_interaction.
TEST(BitwiseConstrainingTest, VulnerabilityFakeKeccakXorOutput)
{
    // =========================================================================
    // STEP 1: Generate a valid keccak + bitwise trace
    // =========================================================================
    TestTraceContainer trace;
    const MemoryAddress src_addr = 0;
    const MemoryAddress dst_addr = 200;
    testing::generate_keccak_trace(trace, { dst_addr }, { src_addr }, /*space_id=*/23);

    // =========================================================================
    // STEP 2: Verify the trace is valid before attack
    // =========================================================================
    check_relation<keccakf1600>(trace);
    check_relation<bitwise>(trace);

    // =========================================================================
    // STEP 3: Find the keccak start row and read the real intermediate values
    // =========================================================================
    uint32_t keccak_start_row = 0;
    for (uint32_t i = 0; i < trace.get_num_rows(); i++) {
        if (trace.get(C::keccakf1600_start, i) == FF(1)) {
            keccak_start_row = i;
            break;
        }
    }
    ASSERT_EQ(trace.get(C::keccakf1600_start, keccak_start_row), FF(1));
    ASSERT_EQ(trace.get(C::keccakf1600_sel_no_error, keccak_start_row), FF(1));

    FF real_state_in_00 = trace.get(C::keccakf1600_state_in_00, keccak_start_row);
    FF real_state_in_01 = trace.get(C::keccakf1600_state_in_01, keccak_start_row);
    FF real_theta_xor_01 = trace.get(C::keccakf1600_theta_xor_01, keccak_start_row);

    // =========================================================================
    // STEP 4: ATTACK - Mutate theta_xor_01 to a FAKE value
    // =========================================================================
    // theta_xor_01 is a committed column only constrained by the THETA_XOR_01 lookup.
    // No PIL relation directly enforces theta_xor_01 = state_in_00 XOR state_in_01.
    FF fake_theta_xor_01 = FF(0xFA0E0BAD0DEADULL);
    ASSERT_NE(fake_theta_xor_01, real_theta_xor_01);
    trace.set(C::keccakf1600_theta_xor_01, keccak_start_row, fake_theta_xor_01);

    // =========================================================================
    // STEP 5: Add FORGED ghost row in bitwise to satisfy the lookup
    // =========================================================================
    uint32_t forged_row = trace.get_num_rows();
    trace.set(forged_row,
              { {
                  { C::bitwise_sel, 0 },          // INACTIVE — constraints don't apply!
                  { C::bitwise_start, 1 },        // But can be matched by keccak lookup!
                  { C::bitwise_start_keccak, 1 }, // Destination selector for keccak XOR lookups
                  { C::bitwise_op_id, FF(AVM_BITWISE_XOR_OP_ID) },
                  { C::bitwise_acc_ia, real_state_in_00 },  // Real input A
                  { C::bitwise_acc_ib, real_state_in_01 },  // Real input B
                  { C::bitwise_acc_ic, fake_theta_xor_01 }, // FAKE output!
                  { C::bitwise_ia_byte, real_state_in_00 },
                  { C::bitwise_ib_byte, real_state_in_01 },
                  { C::bitwise_ic_byte, fake_theta_xor_01 },
                  { C::bitwise_tag_a, FF(MEM_TAG_U64) },
                  { C::bitwise_tag_b, FF(MEM_TAG_U32) }, // != tag_a → mismatch
                  { C::bitwise_sel_tag_mismatch_err, 1 },
                  { C::bitwise_sel_tag_ff_err, 0 },
                  { C::bitwise_err, 1 },
                  { C::bitwise_last, 1 },
                  { C::bitwise_sel_get_ctr, 0 },
                  { C::bitwise_ctr, 0 },
                  { C::bitwise_tag_a_inv, FF(MEM_TAG_U64).invert() },
                  { C::bitwise_tag_ab_diff_inv, FF(MEM_TAG_U64 - MEM_TAG_U32).invert() },
                  { C::bitwise_tag_c, 0 },
              } });

    // =========================================================================
    // STEP 6: Verify ALL relations pass
    // =========================================================================
    // Keccak relations pass because theta_xor_01 is committed, not relationally constrained
    check_relation<keccakf1600>(trace);
    // Bitwise relations pass because ghost row satisfies all constraints with sel=0
    // Commented out as fixed: check_relation<bitwise>(trace);

    // =========================================================================
    // STEP 7: Verify the exploited lookup passes
    // =========================================================================
    // The THETA_XOR_01 lookup:
    //   Source: sel_no_error { xor_op_id, state_in_00, state_in_01, theta_xor_01, tag_u64 }
    //   Dest:   bitwise.start_keccak { op_id, acc_ia, acc_ib, acc_ic, tag_a }
    //
    // Source tuple: (2, real_state_in_00, real_state_in_01, FAKE, 5)
    // Dest tuple:   (2, real_state_in_00, real_state_in_01, FAKE, 5) ← ghost row matches!
    check_interaction<KeccakF1600TraceBuilder, lookup_keccakf1600_theta_xor_01_settings>(trace);

    // =========================================================================
    // VULNERABILITY DEMONSTRATED: KECCAK XOR FORGERY
    // =========================================================================
    // The attacker has successfully proven:
    //   state_in_00 XOR state_in_01 = fake_theta_xor_01
    //
    // When the TRUE relationship is:
    //   state_in_00 XOR state_in_01 = real_theta_xor_01
    //
    // IMPACT: The keccak permutation is COMPLETELY BROKEN. By forging intermediate
    // XOR results, an attacker can produce arbitrary keccak hash outputs, breaking
    // all security guarantees of the hash function.

    // Now that the vulnerability is fixed, we expect an error:
    EXPECT_THROW_WITH_MESSAGE((check_relation<bitwise>(trace)), "BITW_START_ONLY_WHEN_SEL");
}

// This test demonstrates a full exploit: forging a SHA256 XOR result.
// Same vulnerability class as the keccak test but exploiting start_sha256.
TEST(BitwiseConstrainingTest, VulnerabilityFakeSha256XorOutput)
{
    // =========================================================================
    // STEP 1: Generate a valid SHA256 + bitwise trace
    // =========================================================================
    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillRepeatedly(Return(1));

    EventEmitter<BitwiseEvent> bitwise_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;
    simulation::DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<RangeCheckEvent> range_check_event_emitter;

    RangeCheck range_check(range_check_event_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    GreaterThan gt(field_gt, range_check, gt_event_emitter);
    Bitwise bitwise_sim(bitwise_event_emitter);

    EventEmitter<Sha256CompressionEvent> sha256_event_emitter;
    Sha256 sha256_gadget(execution_id_manager, bitwise_sim, gt, sha256_event_emitter);

    std::array<uint32_t, 8> state = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };
    MemoryAddress state_addr = 0;
    for (uint32_t i = 0; i < 8; ++i) {
        mem.set(state_addr + i, MemoryValue::from<uint32_t>(state[i]));
    }

    std::array<uint32_t, 16> input = { 0x61626380, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x18 };
    MemoryAddress input_addr = 8;
    for (uint32_t i = 0; i < 16; ++i) {
        mem.set(input_addr + i, MemoryValue::from<uint32_t>(input[i]));
    }
    MemoryAddress output_addr = 25;

    sha256_gadget.compression(mem, state_addr, input_addr, output_addr);

    TestTraceContainer trace;
    trace.set(C::precomputed_first_row, 0, 1);

    Sha256TraceBuilder sha256_builder;
    sha256_builder.process(sha256_event_emitter.get_events(), trace);

    BitwiseTraceBuilder bitwise_builder;
    bitwise_builder.process(bitwise_event_emitter.dump_events(), trace);

    // =========================================================================
    // STEP 2: Verify the trace is valid before attack
    // =========================================================================
    check_relation<sha256_relation>(trace);
    check_relation<bitwise>(trace);

    // =========================================================================
    // STEP 3: Find a sha256 row with sel_compute_w=1 and read intermediates
    // =========================================================================
    uint32_t sha256_row = 0;
    bool found = false;
    for (uint32_t i = 0; i < trace.get_num_rows(); i++) {
        if (trace.get(C::sha256_sel_compute_w, i) == FF(1)) {
            sha256_row = i;
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "Could not find sha256 row with sel_compute_w=1";

    FF real_w_15_rotr_7 = trace.get(C::sha256_w_15_rotr_7, sha256_row);
    FF real_w_15_rotr_18 = trace.get(C::sha256_w_15_rotr_18, sha256_row);
    FF real_xor_output = trace.get(C::sha256_w_15_rotr_7_xor_w_15_rotr_18, sha256_row);

    // =========================================================================
    // STEP 4: ATTACK - Mutate the XOR intermediate to a FAKE value
    // =========================================================================
    FF fake_xor_output = FF(0xDEADBEEF);
    ASSERT_NE(fake_xor_output, real_xor_output);
    trace.set(C::sha256_w_15_rotr_7_xor_w_15_rotr_18, sha256_row, fake_xor_output);

    // =========================================================================
    // STEP 5: Add FORGED ghost row in bitwise to satisfy the lookup
    // =========================================================================
    uint32_t forged_row = trace.get_num_rows();
    trace.set(forged_row,
              { {
                  { C::bitwise_sel, 0 }, // INACTIVE — constraints don't apply!
                  { C::bitwise_start, 1 },
                  { C::bitwise_start_sha256, 1 }, // Destination selector for sha256 lookups
                  { C::bitwise_op_id, FF(AVM_BITWISE_XOR_OP_ID) },
                  { C::bitwise_acc_ia, real_w_15_rotr_7 },  // Real input A
                  { C::bitwise_acc_ib, real_w_15_rotr_18 }, // Real input B
                  { C::bitwise_acc_ic, fake_xor_output },   // FAKE output!
                  { C::bitwise_ia_byte, real_w_15_rotr_7 },
                  { C::bitwise_ib_byte, real_w_15_rotr_18 },
                  { C::bitwise_ic_byte, fake_xor_output },
                  { C::bitwise_tag_a, FF(MEM_TAG_U32) }, // SHA256 uses U32
                  { C::bitwise_tag_b, FF(MEM_TAG_U8) },  // != tag_a → mismatch
                  { C::bitwise_sel_tag_mismatch_err, 1 },
                  { C::bitwise_sel_tag_ff_err, 0 },
                  { C::bitwise_err, 1 },
                  { C::bitwise_last, 1 },
                  { C::bitwise_sel_get_ctr, 0 },
                  { C::bitwise_ctr, 0 },
                  { C::bitwise_tag_a_inv, FF(MEM_TAG_U32).invert() },
                  { C::bitwise_tag_ab_diff_inv, FF(MEM_TAG_U32 - MEM_TAG_U8).invert() },
                  { C::bitwise_tag_c, 0 },
              } });

    // =========================================================================
    // STEP 6: Verify ALL relations pass
    // =========================================================================
    // SHA256 relations pass because w_15_rotr_7_xor_w_15_rotr_18 is committed,
    // not relationally constrained
    check_relation<sha256_relation>(trace);
    // Bitwise relations pass because ghost row satisfies all constraints with sel=0
    // Commented out as fixed: check_relation<bitwise>(trace);

    // =========================================================================
    // STEP 7: Verify the exploited lookup passes
    // =========================================================================
    // The W_S_0_XOR_0 lookup:
    //   Source: sel_compute_w { w_15_rotr_7, w_15_rotr_18, w_15_rotr_7_xor_w_15_rotr_18, xor_sel, u32_tag }
    //   Dest:   bitwise.start_sha256 { acc_ia, acc_ib, acc_ic, op_id, tag_a }
    //
    // Source tuple: (real_rotr_7, real_rotr_18, FAKE, XOR_OP, U32)
    // Dest tuple:   (real_rotr_7, real_rotr_18, FAKE, XOR_OP, U32) ← ghost row matches!
    //
    // NOTE: We can't use check_interaction<Sha256TraceBuilder, ...> because Sha256TraceBuilder
    // registers this lookup with Column::bitwise_sel as the outer destination selector (production
    // optimization). Our ghost row has sel=0, so it wouldn't be indexed. KeccakF1600TraceBuilder
    // uses Column::bitwise_start instead, which is why the keccak test can use check_interaction
    // directly. Here we use bitwise_start to match the keccak pattern.
    {
        tracegen::SharedIndexCache cache;
        tracegen::LookupIntoDynamicTableGeneric<lookup_sha256_w_s_0_xor_0_settings> lookup(cache, C::bitwise_start);
        lookup.process(trace);
    }

    // =========================================================================
    // VULNERABILITY DEMONSTRATED: SHA256 XOR FORGERY
    // =========================================================================
    // The attacker has successfully proven a fake XOR result in the SHA256
    // message schedule computation. By forging intermediate XOR results,
    // an attacker can produce arbitrary SHA256 compression outputs.

    // Now that the vulnerability is fixed, we expect an error:
    EXPECT_THROW_WITH_MESSAGE((check_relation<bitwise>(trace)), "BITW_START_ONLY_WHEN_SEL");
}

} // namespace
} // namespace bb::avm2::constraining
