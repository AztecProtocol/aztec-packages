#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/bitwise.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bitwise.hpp"
#include "barretenberg/vm2/simulation/gadgets/bitwise.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

// Imports for keccak/sha256 vulnerability exploit tests
#include "barretenberg/aztec/aztec_constants.hpp"
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

// Testing a positive AND operation for each integral type (U1, U8, ... U128). Each op is one row.
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

    EXPECT_EQ(trace.get_num_rows(), 6); // 6 single-row operations.
    check_relation<bitwise>(trace);
}

// Testing a positive OR operation for each integral type (U1, U8, ... U128). Each op is one row.
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

    EXPECT_EQ(trace.get_num_rows(), 6); // 6 single-row operations.
    check_relation<bitwise>(trace);
}

// Testing a positive XOR operation for each integral type (U1, U8, ... U128). Each op is one row.
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

    EXPECT_EQ(trace.get_num_rows(), 6); // 6 single-row operations.
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

    EXPECT_EQ(trace.get_num_rows(), 6); // 6 single-row operations.
    check_relation<bitwise>(trace);
}

// SIMD-64: two independent U64 operations packed into one row. ia/ib/ic hold lane 0 (low 64 bits),
// ia_simd/ib_simd/ic_simd hold lane 1 (high 64 bits); all relations must hold and the lanes must be split.
TEST(BitwiseConstrainingTest, Simd64WithTracegen)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;

    const uint64_t a1 = 0xAAAAAAAAAAAAAAAAULL;
    const uint64_t b1 = 0x5555555555555555ULL;
    const uint64_t a2 = 0x123456789ABCDEF0ULL;
    const uint64_t b2 = 0x0F0F0F0F0F0F0F0FULL;
    const uint128_t A = (static_cast<uint128_t>(a2) << 64) | a1;
    const uint128_t B = (static_cast<uint128_t>(b2) << 64) | b1;

    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from<uint128_t>(A),
          .b = MemoryValue::from<uint128_t>(B),
          .res = A ^ B,
          .simd_64 = true },
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint128_t>(A),
          .b = MemoryValue::from<uint128_t>(B),
          .res = A & B,
          .simd_64 = true },
    };
    builder.process(events, trace);

    check_relation<bitwise>(trace);

    // Row 1 (the SIMD XOR): the two lanes are split across ia/ib/ic (lane 0) and ia_simd/ib_simd/ic_simd (lane 1).
    EXPECT_EQ(trace.get(C::bitwise_sel_simd_64, 0), 1);
    EXPECT_EQ(trace.get(C::bitwise_ia, 0), FF(a1));
    EXPECT_EQ(trace.get(C::bitwise_ia_simd, 0), FF(a2));
    EXPECT_EQ(trace.get(C::bitwise_ib, 0), FF(b1));
    EXPECT_EQ(trace.get(C::bitwise_ib_simd, 0), FF(b2));
    EXPECT_EQ(trace.get(C::bitwise_ic, 0), FF(static_cast<uint64_t>(a1 ^ b1)));
    EXPECT_EQ(trace.get(C::bitwise_ic_simd, 0), FF(static_cast<uint64_t>(a2 ^ b2)));
}

// SIMD-64 is only valid on a U128 row: sel_simd_64 = 1 with sel_u128 = 0 must be rejected.
TEST(BitwiseConstrainingTest, NegativeSimd64OnlyOnU128)
{
    TestTraceContainer trace({
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_sel_keccak, 1 },
            { C::bitwise_sel_simd_64, 1 },
            { C::bitwise_sel_u128, 1 },
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_SIMD_ONLY_ON_U128);

    trace.set(C::bitwise_sel_u128, 0, 0); // SIMD on a non-U128 row
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_SIMD_ONLY_ON_U128),
                              bitwise::get_subrelation_label(bitwise::SR_BITW_SIMD_ONLY_ON_U128));
}

// Verify the byte recomposition relations catch a tampered accumulator. The recomposition gates
// each limb by its width selector, so a U16 row (sel_u8 = sel_u16 = 1) only sums limbs 0 and 1.
TEST(BitwiseConstrainingTest, NegativeRecomposition)
{
    // acc = 0x1234 decomposed into limbs 0x34 (limb 0) and 0x12 (limb 1). The output limbs are the
    // IC_BYTE_* aliases, so we drive them via an op selector (AND) and the per-limb outputs.
    TestTraceContainer trace({
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_sel_compute, 1 },
            { C::bitwise_sel_u16, 1 },
            { C::bitwise_sel_and, 1 },
            { C::bitwise_ia, 0x1234 },
            { C::bitwise_ib, 0x1234 },
            { C::bitwise_ic, 0x1234 },
            { C::bitwise_ia_byte_0_, 0x34 },
            { C::bitwise_ia_byte_1_, 0x12 },
            { C::bitwise_ib_byte_0_, 0x34 },
            { C::bitwise_ib_byte_1_, 0x12 },
            { C::bitwise_output_and_0_, 0x34 }, // IC_BYTE_0 = sel_and * output_and_0
            { C::bitwise_output_and_1_, 0x12 }, // IC_BYTE_1 = sel_and * output_and_1
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_RECOMP_A, bitwise::SR_BITW_RECOMP_B, bitwise::SR_BITW_RECOMP_C);

    trace.set(C::bitwise_ia, 0, 0x1235); // Mutate to wrong value violating BITW_RECOMP_A
    trace.set(C::bitwise_ib, 0, 0x1334); // Mutate to wrong value violating BITW_RECOMP_B
    trace.set(C::bitwise_ic, 0, 0x0234); // Mutate to wrong value violating BITW_RECOMP_C

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_RECOMP_A),
                              bitwise::get_subrelation_label(bitwise::SR_BITW_RECOMP_A));
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_RECOMP_B),
                              bitwise::get_subrelation_label(bitwise::SR_BITW_RECOMP_B));
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_RECOMP_C),
                              bitwise::get_subrelation_label(bitwise::SR_BITW_RECOMP_C));
}

// Verify that a garbage value in an inactive high-order limb cannot affect the recomposed value:
// the limb is gated by a zero width selector and drops out of the sum entirely.
TEST(BitwiseConstrainingTest, InactiveLimbDoesNotAffectRecomposition)
{
    // U8 row (sel_u8 = 1, sel_u16 = 0): only limb 0 contributes. ia = ia_byte_0 = 0x34.
    TestTraceContainer trace({
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_sel_compute, 1 },
            { C::bitwise_ia, 0x34 },
            { C::bitwise_ia_byte_0_, 0x34 },
            { C::bitwise_ia_byte_1_, 0xFF }, // garbage in inactive limb 1
        },
    });

    // Passes even with a non-zero inactive limb: it is multiplied by sel_u16 = 0.
    check_relation<bitwise>(trace, bitwise::SR_BITW_RECOMP_A);
}

// Verify the tag byte length is correctly decomposed over the width selectors.
TEST(BitwiseConstrainingTest, NegativeTagLenDecomposition)
{
    // U16: sel_u16 = 1, tag_byte_len = 1 + 1 = 2.
    TestTraceContainer trace({
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_sel_compute, 1 },
            { C::bitwise_sel_u16, 1 },
            { C::bitwise_tag_byte_len, 2 },
        },
    });

    check_relation<bitwise>(trace, bitwise::SR_BITW_TAG_LEN_DECOMPOSITION);

    trace.set(C::bitwise_tag_byte_len, 0, 3); // Inconsistent with the selectors
    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_TAG_LEN_DECOMPOSITION),
                              bitwise::get_subrelation_label(bitwise::SR_BITW_TAG_LEN_DECOMPOSITION));
}

// Verify that #[INPUT_TAG_CANNOT_BE_FF] catches a prover who hides an FF tag error.
TEST(BitwiseConstrainingTest, NegativeInputTagCannotBeFF)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;
    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::XOR,
          .a = MemoryValue::from_tag(MemoryTag::FF, 1),
          .b = MemoryValue::from_tag(MemoryTag::FF, 1),
          .res = 0 },
    };
    builder.process(events, trace);

    check_relation<bitwise>(trace, bitwise::SR_INPUT_TAG_CANNOT_BE_FF);

    // Mutate: hide the FF error (row 1 is the error row; row 0 is the sentinel).
    trace.set(C::bitwise_sel_tag_ff_err, 0, 0);
    trace.set(C::bitwise_err, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_INPUT_TAG_CANNOT_BE_FF),
                              bitwise::get_subrelation_label(bitwise::SR_INPUT_TAG_CANNOT_BE_FF));
}

// Verify that #[INPUT_TAGS_SHOULD_MATCH] catches a prover who hides a tag mismatch.
TEST(BitwiseConstrainingTest, NegativeInputTagsShouldMatch)
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

    check_relation<bitwise>(trace, bitwise::SR_INPUT_TAGS_SHOULD_MATCH);

    trace.set(C::bitwise_sel_tag_mismatch_err, 0, 0);
    trace.set(C::bitwise_err, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_INPUT_TAGS_SHOULD_MATCH),
                              bitwise::get_subrelation_label(bitwise::SR_INPUT_TAGS_SHOULD_MATCH));
}

// Verify that #[RES_TAG_SHOULD_MATCH_INPUT] catches tag_c != tag_a on a non-error row.
TEST(BitwiseConstrainingTest, NegativeResTagShouldMatchInput)
{
    TestTraceContainer trace;
    BitwiseTraceBuilder builder;
    std::vector<simulation::BitwiseEvent> events = {
        { .operation = BitwiseOperation::AND,
          .a = MemoryValue::from<uint8_t>(85),
          .b = MemoryValue::from<uint8_t>(175),
          .res = 5 },
    };
    builder.process(events, trace);

    check_relation<bitwise>(trace, bitwise::SR_RES_TAG_SHOULD_MATCH_INPUT);

    // Row 1 is the (single) operation row. Mutate tag_c to differ from tag_a.
    trace.set(C::bitwise_tag_c, 0, static_cast<uint8_t>(MemoryTag::U32));

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_RES_TAG_SHOULD_MATCH_INPUT),
                              bitwise::get_subrelation_label(bitwise::SR_RES_TAG_SHOULD_MATCH_INPUT));
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

    precomputed_builder.process_sel_range_16(trace);
    precomputed_builder.process_misc(trace);
    precomputed_builder.process_bitwise(trace);
    precomputed_builder.process_tag_parameters(trace);

    check_all_interactions<BitwiseTraceBuilder>(trace);
    check_relation<bitwise>(trace);
}

TEST(BitwiseConstrainingTest, BitwiseExecInteraction)
{
    TestTraceContainer trace({ {
        // Bitwise Entry (error row: sel=1, err=1)
        { C::bitwise_sel, 1 },
        { C::bitwise_err, 1 },
        { C::bitwise_tag_a, static_cast<uint8_t>(MemoryTag::FF) },
        { C::bitwise_tag_b, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_ia, 0x01 },
        { C::bitwise_tag_c, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_ib, 0x01 },
        { C::bitwise_ic, 0x00 },
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
        { C::bitwise_ib, 0x01 },
        { C::bitwise_ia, 0x01 },
        { C::bitwise_tag_a, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_tag_b, static_cast<uint8_t>(MemoryTag::U8) },
        { C::bitwise_ic, 0x00 },
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
// Vulnerability Tests: keccak/sha256 must not claim bitwise error rows
///////////////////////////

// A malicious prover sets sel_keccak=1 on an error row (sel=1, err=1) to forge an XOR/AND result.
// #[BITW_NO_EXTERNAL_ON_ERROR] makes this impossible.
TEST(BitwiseConstrainingTest, VulnerabilityKeccakOnError)
{
    TestTraceContainer trace({
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_sel_keccak, 1 },
            { C::bitwise_err, 1 },
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_NO_EXTERNAL_ON_ERROR),
                              bitwise::get_subrelation_label(bitwise::SR_BITW_NO_EXTERNAL_ON_ERROR));
}

// Same vulnerability but for sel_sha256 (used by SHA256 compression lookups).
TEST(BitwiseConstrainingTest, VulnerabilitySha256OnError)
{
    TestTraceContainer trace({
        {
            { C::bitwise_sel, 1 },
            { C::bitwise_sel_sha256, 1 },
            { C::bitwise_err, 1 },
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<bitwise>(trace, bitwise::SR_BITW_NO_EXTERNAL_ON_ERROR),
                              bitwise::get_subrelation_label(bitwise::SR_BITW_NO_EXTERNAL_ON_ERROR));
}

// Full exploit attempt: forging a keccak XOR result by mutating an intermediate and adding a ghost
// bitwise row to satisfy the lookup. Because the scalar keccak lookups invoke the bitwise lookup with
// both input tags, a ghost error row (tag mismatch) cannot match the source tuple, so the lookup fails.
// (The SIMD-64 keccak lookups don't pass the tag -- they can't reach error rows since sel_simd_64 is a
// term of #[BITW_NO_EXTERNAL_ON_ERROR] -- so this exploit class is exercised on a scalar lookup.)
TEST(BitwiseConstrainingTest, VulnerabilityFakeKeccakXorOutput)
{
    TestTraceContainer trace;
    const MemoryAddress src_addr = 0;
    const MemoryAddress dst_addr = 200;
    testing::generate_keccak_trace(trace, { dst_addr }, { src_addr }, /*space_id=*/23);

    check_relation<keccakf1600>(trace);
    check_relation<bitwise>(trace);

    uint32_t keccak_start_row = 0;
    for (uint32_t i = 0; i < trace.get_num_rows(); i++) {
        if (trace.get(C::keccakf1600_start, i) == FF(1)) {
            keccak_start_row = i;
            break;
        }
    }
    ASSERT_EQ(trace.get(C::keccakf1600_start, keccak_start_row), FF(1));
    ASSERT_EQ(trace.get(C::keccakf1600_sel_no_error, keccak_start_row), FF(1));

    // theta_xor_41 is computed by the scalar (non-SIMD) lookup THETA_XOR_41, which XORs sheet 4's
    // state_in_40 and state_in_41 into theta_xor_41 as a single U64 operation.
    FF real_state_in_40 = trace.get(C::keccakf1600_state_in_40, keccak_start_row);
    FF real_state_in_41 = trace.get(C::keccakf1600_state_in_41, keccak_start_row);
    FF real_theta_xor_41 = trace.get(C::keccakf1600_theta_xor_41, keccak_start_row);

    // theta_xor_41 is a committed column only constrained by the THETA_XOR_41 lookup.
    FF fake_theta_xor_41 = FF(0xFA0E0BAD0DEADULL);
    ASSERT_NE(fake_theta_xor_41, real_theta_xor_41);
    trace.set(C::keccakf1600_theta_xor_41, keccak_start_row, fake_theta_xor_41);

    // Forged ghost row in bitwise to try to satisfy the lookup. The source passes both tags as U64;
    // we give the ghost row a mismatched tag_b so the tuple cannot match.
    uint32_t forged_row = trace.get_num_rows();
    trace.set(forged_row,
              { {
                  { C::bitwise_sel, 1 },
                  { C::bitwise_sel_keccak, 1 }, // Destination selector for scalar keccak lookups
                  { C::bitwise_op_id, FF(AVM_BITWISE_XOR_OP_ID) },
                  { C::bitwise_ia, real_state_in_40 },
                  { C::bitwise_ib, real_state_in_41 },
                  { C::bitwise_ic, fake_theta_xor_41 }, // FAKE output!
                  { C::bitwise_tag_a, FF(MEM_TAG_U64) },
                  { C::bitwise_tag_b, FF(MEM_TAG_U32) }, // != tag_a -> mismatch
                  { C::bitwise_tag_c, 0 },
              } });

    // Keccak relations still pass (theta_xor_41 is committed, not relationally constrained).
    check_relation<keccakf1600>(trace);

    // The exploited lookup fails: keccak passes both tags (U64, U64) but the ghost row has tag_b=U32.
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<KeccakF1600TraceBuilder, lookup_keccakf1600_theta_xor_41_settings>(trace)),
        "Failed.*LOOKUP_KECCAKF1600_THETA_XOR_41. Could not find tuple in destination.");
}

// Full exploit attempt: forging a SHA256 XOR result. Same vulnerability class as the keccak test.
TEST(BitwiseConstrainingTest, VulnerabilityFakeSha256XorOutput)
{
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
    Sha256 sha256_gadget(execution_id_manager, bitwise_sim, gt, range_check, sha256_event_emitter);

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

    check_relation<sha256_relation>(trace);
    check_relation<bitwise>(trace);

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

    FF fake_xor_output = FF(0xDEADBEEF);
    ASSERT_NE(fake_xor_output, real_xor_output);
    trace.set(C::sha256_w_15_rotr_7_xor_w_15_rotr_18, sha256_row, fake_xor_output);

    // Forged ghost row in bitwise (error row, tag mismatch) to try to satisfy the lookup.
    uint32_t forged_row = trace.get_num_rows();
    trace.set(forged_row,
              { {
                  { C::bitwise_sel, 1 },
                  { C::bitwise_sel_sha256, 1 }, // Destination selector for sha256 lookups
                  { C::bitwise_op_id, FF(AVM_BITWISE_XOR_OP_ID) },
                  { C::bitwise_ia, real_w_15_rotr_7 },   // Real input A
                  { C::bitwise_ib, real_w_15_rotr_18 },  // Real input B
                  { C::bitwise_ic, fake_xor_output },    // FAKE output!
                  { C::bitwise_tag_a, FF(MEM_TAG_U32) }, // SHA256 uses U32
                  { C::bitwise_tag_b, FF(MEM_TAG_U8) },  // != tag_a -> mismatch
                  { C::bitwise_sel_tag_mismatch_err, 1 },
                  { C::bitwise_sel_tag_ff_err, 0 },
                  { C::bitwise_err, 1 },
                  { C::bitwise_tag_a_inv, FF(MEM_TAG_U32).invert() },
                  { C::bitwise_tag_ab_diff_inv, FF(MEM_TAG_U32 - MEM_TAG_U8).invert() },
                  { C::bitwise_tag_c, 0 },
              } });

    // SHA256 relations still pass (the XOR intermediate is committed, not relationally constrained).
    check_relation<sha256_relation>(trace);

    // The exploited lookup fails because the source passes both tags (U32, U32) but the ghost row
    // has tag_b=U8. The sha256 tracegen registers this lookup with C::bitwise_sel as the outer
    // destination selector.
    {
        tracegen::SharedIndexCache cache;
        tracegen::LookupIntoDynamicTableGeneric<lookup_sha256_w_s_0_xor_0_settings> lookup(cache, C::bitwise_sel);
        EXPECT_THROW_WITH_MESSAGE((lookup.process(trace)),
                                  "Failed.*LOOKUP_SHA256_W_S_0_XOR_0. Could not find tuple in destination.");
    }
}

} // namespace
} // namespace bb::avm2::constraining
