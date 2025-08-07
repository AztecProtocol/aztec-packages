#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <tuple>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using simulation::AluError;
using simulation::AluOperation;
using testing::ElementsAre;

using R = TestTraceContainer::Row;

// Generic structure for three-operand opcodes
using ThreeOperandTestParams = std::tuple<MemoryValue, MemoryValue, MemoryValue>;

const std::vector<std::tuple<MemoryValue, MemoryValue>> TEST_VALUES_IN = {
    {
        MemoryValue::from_tag(MemoryTag::U1, 1),
        MemoryValue::from_tag(MemoryTag::U1, 0),
    },
    {
        MemoryValue::from_tag(MemoryTag::U1, 1),
        MemoryValue::from_tag(MemoryTag::U1, 1),
    },
    {
        MemoryValue::from_tag(MemoryTag::U8, 200),
        MemoryValue::from_tag(MemoryTag::U8, 50),
    },
    {
        MemoryValue::from_tag(MemoryTag::U8, 200),
        MemoryValue::from_tag(MemoryTag::U8, 255),
    },
    {
        MemoryValue::from_tag(MemoryTag::U16, 30),
        MemoryValue::from_tag(MemoryTag::U16, 65500),
    },
    {
        MemoryValue::from_tag(MemoryTag::U16, 65501),
        MemoryValue::from_tag(MemoryTag::U16, 65500),
    },
    {
        MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 10),
        MemoryValue::from_tag(MemoryTag::U32, 5),
    },
    {
        MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 10),
        MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 5),
    },
    {
        MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 10),
        MemoryValue::from_tag(MemoryTag::U64, 5),
    },
    {
        MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 10),
        MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 5),
    },
    {
        MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 10),
        MemoryValue::from_tag(MemoryTag::U128, 5),
    },
    {
        MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 10),
        MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 5),
    },
    {
        MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 4),
        MemoryValue::from_tag(MemoryTag::FF, 2),
    },
};

std::vector<ThreeOperandTestParams> zip_helper(const std::vector<MemoryValue>& out)
{
    std::vector<ThreeOperandTestParams> res;
    uint32_t i = 0;
    for (const auto c : out) {
        ThreeOperandTestParams params = tuple_cat(TEST_VALUES_IN.at(i), std::make_tuple(c));
        res.push_back(params);
        i++;
    }
    return res;
}

std::vector<MemoryValue> split_helper(const std::vector<std::tuple<MemoryValue, MemoryValue>>& in)
{
    std::vector<MemoryValue> res;
    res.reserve(in.size());
    for (const auto& c : in) {
        res.push_back(std::get<0>(c));
    }
    return res;
}

class AluTraceGenerationTest : public ::testing::Test {
  public:
    TestTraceContainer trace;
    AluTraceBuilder builder;
};

// ADD TESTS

const std::vector<MemoryValue> TEST_VALUES_ADD_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U8, 250),
    MemoryValue::from_tag(MemoryTag::U8, 199),
    MemoryValue::from_tag(MemoryTag::U16, 65530),
    MemoryValue::from_tag(MemoryTag::U16, 65465),
    MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 5),
    MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 15),
    MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 5),
    MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 15),
    MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 5),
    MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 15),
    MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 2),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_ADD = zip_helper(TEST_VALUES_ADD_OUT);

class AluAddTraceGenerationTest : public AluTraceGenerationTest,
                                  public ::testing::WithParamInterface<ThreeOperandTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest, AluAddTraceGenerationTest, ::testing::ValuesIn(TEST_VALUES_ADD));

TEST_P(AluAddTraceGenerationTest, TraceGenerationAdd)
{
    auto [a, b, c] = GetParam();
    auto tag = a.get_tag();
    builder.process(
        {
            { .operation = AluOperation::ADD, .a = a, .b = b, .c = c },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                          ROW_FIELD_EQ(alu_sel, 1),
                          ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                          ROW_FIELD_EQ(alu_ia, a),
                          ROW_FIELD_EQ(alu_ib, b),
                          ROW_FIELD_EQ(alu_ic, c),
                          ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                          ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                          ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(tag)),
                          ROW_FIELD_EQ(alu_cf, a.as_ff() + b.as_ff() != c.as_ff() ? 1 : 0),
                          ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
                          ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
                          ROW_FIELD_EQ(alu_sel_is_ff, 0), // We don't set/check is_ff for ADD
                          ROW_FIELD_EQ(alu_sel_tag_err, 0),
                          ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_F(AluTraceGenerationTest, TraceGenerationAddTagError)
{
    builder.process(
        {
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint64_t>(2),
              .c = MemoryValue::from<uint128_t>(3),
              .error = AluError::TAG_ERROR },
            { .operation = AluOperation::ADD,
              .a = MemoryValue::from<uint128_t>(1),
              .b = MemoryValue::from<uint128_t>(2),
              .c = MemoryValue::from<uint64_t>(3) },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 2),
                  ROW_FIELD_EQ(alu_ic, 3),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(MemoryTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(MemoryTag::U64)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U128)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(MemoryTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(MemoryTag::U128)),
                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                  ROW_FIELD_EQ(alu_sel_ab_tag_mismatch, 1),
                  ROW_FIELD_EQ(alu_sel_tag_err, 1),
                  ROW_FIELD_EQ(alu_sel_err, 1),
                  ROW_FIELD_EQ(
                      alu_ab_tags_diff_inv,
                      FF(static_cast<uint8_t>(MemoryTag::U128) - static_cast<uint8_t>(MemoryTag::U64)).invert())),
            AllOf(ROW_FIELD_EQ(alu_sel_op_add, 1),
                  ROW_FIELD_EQ(alu_sel, 1),
                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_ADD),
                  ROW_FIELD_EQ(alu_ia, 1),
                  ROW_FIELD_EQ(alu_ib, 2),
                  ROW_FIELD_EQ(alu_ic, 3),
                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(MemoryTag::U128)),
                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(MemoryTag::U128)),
                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U64)),
                  ROW_FIELD_EQ(alu_cf, 0),
                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(MemoryTag::U128)),
                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(MemoryTag::U128)),
                  ROW_FIELD_EQ(alu_sel_is_ff, 0),
                  ROW_FIELD_EQ(alu_sel_tag_err,
                               0)) // Incorrect c tag does not create a tag error (see C_TAG_CHECK)
            ));
}

// SUB TESTS

const std::vector<MemoryValue> TEST_VALUES_SUB_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U8, 150),
    MemoryValue::from_tag(MemoryTag::U8, 201),
    MemoryValue::from_tag(MemoryTag::U16, 66),
    MemoryValue::from_tag(MemoryTag::U16, 1),
    MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 15),
    MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 5),
    MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 15),
    MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 5),
    MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 15),
    MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 5),
    MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 6),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_SUB = zip_helper(TEST_VALUES_SUB_OUT);

class AluSubTraceGenerationTest : public AluTraceGenerationTest,
                                  public ::testing::WithParamInterface<ThreeOperandTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest, AluSubTraceGenerationTest, ::testing::ValuesIn(TEST_VALUES_SUB));

TEST_P(AluSubTraceGenerationTest, TraceGenerationSub)
{
    auto [a, b, c] = GetParam();
    auto tag = a.get_tag();
    builder.process(
        {
            { .operation = AluOperation::SUB, .a = a, .b = b, .c = c },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_sub, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_SUB),
                                  ROW_FIELD_EQ(alu_ia, a),
                                  ROW_FIELD_EQ(alu_ib, b),
                                  ROW_FIELD_EQ(alu_ic, c),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_cf, a.as_ff() - b.as_ff() != c.as_ff() ? 1 : 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
                                  ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

// MUL TESTS

const std::vector<MemoryValue> TEST_VALUES_MUL_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U8, 16),
    MemoryValue::from_tag(MemoryTag::U8, 8),
    MemoryValue::from_tag(MemoryTag::U16, 64456),
    MemoryValue::from_tag(MemoryTag::U16, 1260),
    MemoryValue::from_tag(MemoryTag::U32, (uint256_t(1) << 32) - 50),
    MemoryValue::from_tag(MemoryTag::U32, 50),
    MemoryValue::from_tag(MemoryTag::U64, (uint256_t(1) << 64) - 50),
    MemoryValue::from_tag(MemoryTag::U64, 50),
    MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 128) - 50),
    MemoryValue::from_tag(MemoryTag::U128, 50),
    MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 8),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_MUL = zip_helper(TEST_VALUES_MUL_OUT);

class AluMulTraceGenerationTest : public AluTraceGenerationTest,
                                  public ::testing::WithParamInterface<ThreeOperandTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest, AluMulTraceGenerationTest, ::testing::ValuesIn(TEST_VALUES_MUL));

TEST_P(AluMulTraceGenerationTest, TraceGenerationMul)
{
    auto [a, b, c] = GetParam();
    auto tag = a.get_tag();
    uint256_t a_int = static_cast<uint256_t>(a.as_ff());
    uint256_t b_int = static_cast<uint256_t>(b.as_ff());
    auto c_hi = tag == MemoryTag::FF ? 0 : (a_int * b_int) >> get_tag_bits(tag);
    bool is_u128 = tag == MemoryTag::U128;
    bool cf = false;
    if (is_u128) {
        // For u128s, we decompose a and b into 64 bit chunks:
        auto a_hi = simulation::decompose(static_cast<uint128_t>(a.as_ff())).hi;
        auto b_hi = simulation::decompose(static_cast<uint128_t>(b.as_ff())).hi;
        // c_hi = old_c_hi - a_hi * b_hi % 2^64
        auto hi_operand = static_cast<uint256_t>(a_hi) * static_cast<uint256_t>(b_hi);
        cf = hi_operand != 0;
        c_hi = (c_hi - hi_operand) % (uint256_t(1) << 64);
    }
    builder.process(
        {
            { .operation = AluOperation::MUL, .a = a, .b = b, .c = c },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(
            ROW_FIELD_EQ(alu_sel_op_mul, 1),
            ROW_FIELD_EQ(alu_sel, 1),
            ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_MUL),
            ROW_FIELD_EQ(alu_ia, a),
            ROW_FIELD_EQ(alu_ib, b),
            ROW_FIELD_EQ(alu_ic, c),
            ROW_FIELD_EQ(alu_c_hi, c_hi),
            ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_cf, cf),
            ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
            ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
            ROW_FIELD_EQ(alu_constant_64, 64),
            ROW_FIELD_EQ(alu_sel_is_u128, is_u128 ? 1 : 0),
            ROW_FIELD_EQ(alu_tag_u128_diff_inv,
                         is_u128 ? 0 : FF(static_cast<uint8_t>(tag) - static_cast<uint8_t>(MemoryTag::U128)).invert()),
            ROW_FIELD_EQ(alu_sel_mul_div_u128, is_u128 ? 1 : 0),
            ROW_FIELD_EQ(alu_sel_mul_u128, is_u128 ? 1 : 0),
            ROW_FIELD_EQ(alu_sel_tag_err, 0),
            ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_F(AluTraceGenerationTest, TraceGenerationMulU128)
{
    uint128_t u128_max = static_cast<uint128_t>(get_tag_max_value(MemoryTag::U128));
    builder.process(
        {
            { .operation = AluOperation::MUL,
              .a = MemoryValue::from<uint128_t>(2),
              .b = MemoryValue::from<uint128_t>(3),
              .c = MemoryValue::from<uint128_t>(6) },
            { .operation = AluOperation::MUL,
              .a = MemoryValue::from<uint128_t>(u128_max),
              .b = MemoryValue::from<uint128_t>(u128_max - 2),
              .c = MemoryValue::from<uint128_t>(3) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_mul, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_MUL),
                                  ROW_FIELD_EQ(alu_ia, 2),
                                  ROW_FIELD_EQ(alu_a_hi, 0),
                                  ROW_FIELD_EQ(alu_a_lo, 2),
                                  ROW_FIELD_EQ(alu_ib, 3),
                                  ROW_FIELD_EQ(alu_b_hi, 0),
                                  ROW_FIELD_EQ(alu_b_lo, 3),
                                  ROW_FIELD_EQ(alu_ic, 6),
                                  ROW_FIELD_EQ(alu_c_hi, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_cf, 0),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_constant_64, 64),
                                  ROW_FIELD_EQ(alu_sel_is_u128, 1),
                                  ROW_FIELD_EQ(alu_tag_u128_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_mul_div_u128, 1),
                                  ROW_FIELD_EQ(alu_sel_mul_u128, 1),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_mul, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_MUL),
                                  ROW_FIELD_EQ(alu_ia, u128_max),
                                  ROW_FIELD_EQ(alu_a_hi, (uint256_t(1) << 64) - 1),
                                  ROW_FIELD_EQ(alu_a_lo, (uint256_t(1) << 64) - 1),
                                  ROW_FIELD_EQ(alu_ib, u128_max - 2),
                                  ROW_FIELD_EQ(alu_b_hi, (uint256_t(1) << 64) - 1),
                                  ROW_FIELD_EQ(alu_b_lo, (uint256_t(1) << 64) - 3),
                                  ROW_FIELD_EQ(alu_ic, 3),
                                  ROW_FIELD_EQ(alu_c_hi, (uint256_t(1) << 64) - 5),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_cf, 1),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_sel_is_u128, 1),
                                  ROW_FIELD_EQ(alu_tag_u128_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_mul_div_u128, 1),
                                  ROW_FIELD_EQ(alu_sel_mul_u128, 1),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

// DIV TESTS

const std::vector<MemoryValue> TEST_VALUES_DIV_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 0), // Dividing by zero, so expecting an error
    MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U8, 4),
    MemoryValue::from_tag(MemoryTag::U8, 0),
    MemoryValue::from_tag(MemoryTag::U16, 0),
    MemoryValue::from_tag(MemoryTag::U16, 1),
    MemoryValue::from_tag(MemoryTag::U32, 0x33333331),
    MemoryValue::from_tag(MemoryTag::U32, 1),
    MemoryValue::from_tag(MemoryTag::U64, 0x3333333333333331ULL),
    MemoryValue::from_tag(MemoryTag::U64, 1),
    MemoryValue::from_tag(MemoryTag::U128, (((uint256_t(1) << 128) - 11) / 5)), // 0x3333333333333333333333333333331
    MemoryValue::from_tag(MemoryTag::U128, 1),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_DIV = zip_helper(TEST_VALUES_DIV_OUT);

class AluDivTraceGenerationTest : public AluTraceGenerationTest,
                                  public ::testing::WithParamInterface<ThreeOperandTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest, AluDivTraceGenerationTest, ::testing::ValuesIn(TEST_VALUES_DIV));

TEST_P(AluDivTraceGenerationTest, TraceGenerationDiv)
{
    auto [a, b, c] = GetParam();
    auto tag = a.get_tag();
    bool div_0_error = b.as_ff() == FF(0);
    bool is_u128 = tag == MemoryTag::U128;
    builder.process(
        {
            { .operation = AluOperation::DIV,
              .a = a,
              .b = b,
              .c = c,
              .error = div_0_error ? std::make_optional(simulation::AluError::DIV_0_ERROR) : std::nullopt },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(
            ROW_FIELD_EQ(alu_sel_op_div, 1),
            ROW_FIELD_EQ(alu_sel, 1),
            ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_DIV),
            ROW_FIELD_EQ(alu_ia, a),
            ROW_FIELD_EQ(alu_ib, b),
            ROW_FIELD_EQ(alu_ic, c),
            ROW_FIELD_EQ(alu_helper1, a - b * c),
            ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
            ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
            ROW_FIELD_EQ(alu_constant_64, 64),
            ROW_FIELD_EQ(alu_sel_is_u128, is_u128 ? 1 : 0),
            ROW_FIELD_EQ(alu_tag_u128_diff_inv,
                         is_u128 ? 0 : FF(static_cast<uint8_t>(tag) - static_cast<uint8_t>(MemoryTag::U128)).invert()),
            ROW_FIELD_EQ(alu_sel_is_ff, 0),
            ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                         FF(static_cast<uint8_t>(tag) - static_cast<uint8_t>(MemoryTag::FF)).invert()),
            ROW_FIELD_EQ(alu_sel_mul_div_u128, is_u128 ? 1 : 0),
            ROW_FIELD_EQ(alu_sel_div_no_0_err, div_0_error ? 0 : 1),
            ROW_FIELD_EQ(alu_sel_div_0_err, div_0_error ? 1 : 0),
            ROW_FIELD_EQ(alu_sel_tag_err, 0),
            ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_F(AluTraceGenerationTest, TraceGenerationDivU128)
{
    uint128_t u128_max = static_cast<uint128_t>(get_tag_max_value(MemoryTag::U128));
    builder.process(
        {
            { .operation = AluOperation::DIV,
              .a = MemoryValue::from<uint128_t>(6),
              .b = MemoryValue::from<uint128_t>(3),
              .c = MemoryValue::from<uint128_t>(2) },
            { .operation = AluOperation::DIV,
              .a = MemoryValue::from<uint128_t>(u128_max),
              .b = MemoryValue::from<uint128_t>(u128_max - 2),
              .c = MemoryValue::from<uint128_t>(1) },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_div, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_DIV),
                                  ROW_FIELD_EQ(alu_ia, 6),
                                  ROW_FIELD_EQ(alu_a_hi, 0),
                                  ROW_FIELD_EQ(alu_a_lo, 2),
                                  ROW_FIELD_EQ(alu_ib, 3),
                                  ROW_FIELD_EQ(alu_b_hi, 0),
                                  ROW_FIELD_EQ(alu_b_lo, 3),
                                  ROW_FIELD_EQ(alu_ic, 2),
                                  ROW_FIELD_EQ(alu_helper1, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_constant_64, 64),
                                  ROW_FIELD_EQ(alu_sel_is_u128, 1),
                                  ROW_FIELD_EQ(alu_tag_u128_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_mul_div_u128, 1),
                                  ROW_FIELD_EQ(alu_sel_div_no_0_err, 1),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
                            AllOf(ROW_FIELD_EQ(alu_sel_op_div, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_DIV),
                                  ROW_FIELD_EQ(alu_ia, u128_max),
                                  ROW_FIELD_EQ(alu_a_hi, 0),
                                  ROW_FIELD_EQ(alu_a_lo, 1),
                                  ROW_FIELD_EQ(alu_ib, u128_max - 2),
                                  ROW_FIELD_EQ(alu_b_hi, (uint256_t(1) << 64) - 1),
                                  ROW_FIELD_EQ(alu_b_lo, (uint256_t(1) << 64) - 3),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_helper1, 2),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(MemoryTag::U128)),
                                  ROW_FIELD_EQ(alu_max_value, u128_max),
                                  ROW_FIELD_EQ(alu_sel_is_u128, 1),
                                  ROW_FIELD_EQ(alu_tag_u128_diff_inv, 0),
                                  ROW_FIELD_EQ(alu_sel_mul_div_u128, 1),
                                  ROW_FIELD_EQ(alu_sel_div_no_0_err, 1),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_F(AluTraceGenerationTest, TraceGenerationDivTagError)
{
    // Tests two cases unique to DIV:
    // a. inputs are both FF => should have a tag error (FF_TAG_ERR)
    // b. input a is FF, b is not => should have a tag error with BOTH FF_TAG_ERR and ab_tag_mismatch
    builder.process(
        {
            { .operation = AluOperation::DIV,
              .a = MemoryValue::from<FF>(6),
              .b = MemoryValue::from<FF>(3),
              .c = MemoryValue::from<FF>(2),
              .error = AluError::TAG_ERROR },
            { .operation = AluOperation::DIV,
              .a = MemoryValue::from<FF>(6),
              .b = MemoryValue::from<uint128_t>(3),
              .c = MemoryValue::from<FF>(2),
              .error = AluError::TAG_ERROR },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            AllOf(
                ROW_FIELD_EQ(alu_sel_op_div, 1),
                ROW_FIELD_EQ(alu_sel, 1),
                ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_DIV),
                ROW_FIELD_EQ(alu_ia, 6),
                ROW_FIELD_EQ(alu_ib, 3),
                ROW_FIELD_EQ(alu_ic, 2),
                ROW_FIELD_EQ(alu_helper1, 0),
                ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(MemoryTag::FF)),
                ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(MemoryTag::FF)),
                ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::FF)),
                ROW_FIELD_EQ(alu_max_bits, get_tag_bits(MemoryTag::FF)),
                ROW_FIELD_EQ(alu_max_value, get_tag_max_value(MemoryTag::FF)),
                ROW_FIELD_EQ(alu_constant_64, 64),
                ROW_FIELD_EQ(alu_sel_is_u128, 0),
                ROW_FIELD_EQ(alu_tag_u128_diff_inv,
                             FF(static_cast<uint8_t>(MemoryTag::FF) - static_cast<uint8_t>(MemoryTag::U128)).invert()),
                ROW_FIELD_EQ(alu_sel_is_ff, 1),
                ROW_FIELD_EQ(alu_sel_mul_div_u128, 0),
                ROW_FIELD_EQ(alu_sel_div_no_0_err, 1),
                ROW_FIELD_EQ(alu_sel_tag_err, 1),
                ROW_FIELD_EQ(alu_sel_err, 1),
                ROW_FIELD_EQ(alu_sel_ab_tag_mismatch, 0),
                ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0)),
            AllOf(
                ROW_FIELD_EQ(alu_sel_op_div, 1),
                ROW_FIELD_EQ(alu_sel, 1),
                ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_DIV),
                ROW_FIELD_EQ(alu_ia, 6),
                ROW_FIELD_EQ(alu_ib, 3),
                ROW_FIELD_EQ(alu_ic, 2),
                ROW_FIELD_EQ(alu_helper1, 0),
                ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(MemoryTag::FF)),
                ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(MemoryTag::U128)),
                ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::FF)),
                ROW_FIELD_EQ(alu_max_bits, get_tag_bits(MemoryTag::FF)),
                ROW_FIELD_EQ(alu_max_value, get_tag_max_value(MemoryTag::FF)),
                ROW_FIELD_EQ(alu_constant_64, 64),
                ROW_FIELD_EQ(alu_sel_is_u128, 0),
                ROW_FIELD_EQ(alu_tag_u128_diff_inv,
                             FF(static_cast<uint8_t>(MemoryTag::FF) - static_cast<uint8_t>(MemoryTag::U128)).invert()),
                ROW_FIELD_EQ(alu_sel_is_ff, 1),
                ROW_FIELD_EQ(alu_sel_mul_div_u128, 0),
                ROW_FIELD_EQ(alu_sel_div_no_0_err, 1),
                ROW_FIELD_EQ(alu_sel_tag_err, 1),
                ROW_FIELD_EQ(alu_sel_err, 1),
                ROW_FIELD_EQ(alu_sel_ab_tag_mismatch, 1),
                ROW_FIELD_EQ(
                    alu_ab_tags_diff_inv,
                    FF(static_cast<uint8_t>(MemoryTag::FF) - static_cast<uint8_t>(MemoryTag::U128)).invert()))));
}

// EQ TESTS

const std::vector<MemoryValue> TEST_VALUES_EQ_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_EQ = zip_helper(TEST_VALUES_EQ_OUT);

class AluEQTraceGenerationTest : public AluTraceGenerationTest,
                                 public ::testing::WithParamInterface<ThreeOperandTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest, AluEQTraceGenerationTest, ::testing::ValuesIn(TEST_VALUES_EQ));

TEST_P(AluEQTraceGenerationTest, TraceGenerationEQ)
{
    auto [a, _b, _c] = GetParam();
    auto tag = a.get_tag();

    builder.process(
        {
            {
                .operation = AluOperation::EQ,
                .a = a,
                .b = a,
                .c = MemoryValue::from_tag(MemoryTag::U1, 1),
            },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_eq, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
                                  ROW_FIELD_EQ(alu_ia, a),
                                  ROW_FIELD_EQ(alu_ib, a),
                                  ROW_FIELD_EQ(alu_ic, 1),
                                  ROW_FIELD_EQ(alu_helper1, 0),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U1)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

TEST_P(AluEQTraceGenerationTest, TraceGenerationInEQ)
{
    auto [a, b, c] = GetParam();
    auto tag = a.get_tag();

    builder.process(
        {
            {
                .operation = AluOperation::EQ,
                .a = a,
                .b = b,
                .c = c,
            },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_eq, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_EQ),
                                  ROW_FIELD_EQ(alu_ia, a),
                                  ROW_FIELD_EQ(alu_ib, b),
                                  ROW_FIELD_EQ(alu_ic, c),
                                  ROW_FIELD_EQ(alu_helper1, c.as_ff() == 1 ? 0 : FF(a.as_ff() - b.as_ff()).invert()),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U1)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

// LT TESTS

const std::vector<MemoryValue> TEST_VALUES_LT_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 1), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_LT = zip_helper(TEST_VALUES_LT_OUT);

class AluLTTraceGenerationTest : public AluTraceGenerationTest,
                                 public ::testing::WithParamInterface<ThreeOperandTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest, AluLTTraceGenerationTest, ::testing::ValuesIn(TEST_VALUES_LT));

TEST_P(AluLTTraceGenerationTest, TraceGenerationLT)
{
    auto [a, b, c] = GetParam();
    auto tag = a.get_tag();
    bool is_ff = tag == MemoryTag::FF;
    builder.process(
        {
            { .operation = AluOperation::LT, .a = a, .b = b, .c = c },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(
            ROW_FIELD_EQ(alu_sel_op_lt, 1),
            ROW_FIELD_EQ(alu_sel_lt_ops, 1),
            ROW_FIELD_EQ(alu_sel, 1),
            ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LT),
            ROW_FIELD_EQ(alu_ia, a),
            ROW_FIELD_EQ(alu_ib, b),
            ROW_FIELD_EQ(alu_ic, c),
            ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U1)),
            ROW_FIELD_EQ(alu_cf, 0),
            ROW_FIELD_EQ(alu_lt_ops_input_a, b),
            ROW_FIELD_EQ(alu_lt_ops_input_b, a),
            ROW_FIELD_EQ(alu_lt_ops_result_c, c),
            ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
            ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
            ROW_FIELD_EQ(alu_sel_is_ff, is_ff ? 1 : 0),
            ROW_FIELD_EQ(alu_sel_ff_lt_ops, is_ff ? 1 : 0),
            ROW_FIELD_EQ(alu_sel_int_lt_ops, is_ff ? 0 : 1),
            ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                         is_ff ? 0 : FF(static_cast<uint8_t>(tag) - static_cast<uint8_t>(MemoryTag::FF)).invert()),
            ROW_FIELD_EQ(alu_sel_tag_err, 0),
            ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

// LTE TESTS

const std::vector<MemoryValue> TEST_VALUES_LTE_OUT = {
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 1), MemoryValue::from_tag(MemoryTag::U1, 0),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0), MemoryValue::from_tag(MemoryTag::U1, 1),
    MemoryValue::from_tag(MemoryTag::U1, 0),
};

const std::vector<ThreeOperandTestParams> TEST_VALUES_LTE = zip_helper(TEST_VALUES_LTE_OUT);

class AluLTETraceGenerationTest : public AluTraceGenerationTest,
                                  public ::testing::WithParamInterface<ThreeOperandTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest, AluLTETraceGenerationTest, ::testing::ValuesIn(TEST_VALUES_LTE));

TEST_P(AluLTETraceGenerationTest, TraceGenerationLTE)
{
    auto [a, b, c] = GetParam();
    auto tag = a.get_tag();
    bool is_ff = tag == MemoryTag::FF;
    builder.process(
        {
            { .operation = AluOperation::LTE, .a = a, .b = b, .c = c },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(
            ROW_FIELD_EQ(alu_sel_op_lte, 1),
            ROW_FIELD_EQ(alu_sel_lt_ops, 1),
            ROW_FIELD_EQ(alu_sel, 1),
            ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_LTE),
            ROW_FIELD_EQ(alu_ia, a),
            ROW_FIELD_EQ(alu_ib, b),
            ROW_FIELD_EQ(alu_ic, c),
            ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(MemoryTag::U1)),
            ROW_FIELD_EQ(alu_cf, 0),
            ROW_FIELD_EQ(alu_lt_ops_input_a, a),
            ROW_FIELD_EQ(alu_lt_ops_input_b, b),
            ROW_FIELD_EQ(alu_lt_ops_result_c, c.as_ff() == 1 ? 0 : 1),
            ROW_FIELD_EQ(alu_max_bits, get_tag_bits(tag)),
            ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
            ROW_FIELD_EQ(alu_sel_is_ff, is_ff ? 1 : 0),
            ROW_FIELD_EQ(alu_sel_ff_lt_ops, is_ff ? 1 : 0),
            ROW_FIELD_EQ(alu_sel_int_lt_ops, is_ff ? 0 : 1),
            ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                         is_ff ? 0 : FF(static_cast<uint8_t>(tag) - static_cast<uint8_t>(MemoryTag::FF)).invert()),
            ROW_FIELD_EQ(alu_sel_tag_err, 0),
            ROW_FIELD_EQ(alu_ab_tags_diff_inv, 0))));
}

// NOT Opcode TESTS

const std::vector<MemoryValue> TEST_VALUES_NOT = split_helper(TEST_VALUES_IN);

class AluNOTTraceGenerationTest : public AluTraceGenerationTest, public ::testing::WithParamInterface<MemoryValue> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest, AluNOTTraceGenerationTest, ::testing::ValuesIn(TEST_VALUES_NOT));

TEST_P(AluNOTTraceGenerationTest, TraceGenerationNOT)
{
    auto a = GetParam();
    auto tag = a.get_tag();
    bool is_ff = tag == MemoryTag::FF;
    auto b = is_ff ? MemoryValue::from_tag(MemoryTag::FF, 0) : ~a;

    builder.process(
        {
            { .operation = AluOperation::NOT,
              .a = a,
              .b = b,
              .error = is_ff ? std::make_optional(simulation::AluError::TAG_ERROR) : std::nullopt },
        },
        trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(
            ROW_FIELD_EQ(alu_sel_op_not, 1),
            ROW_FIELD_EQ(alu_sel, 1),
            ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_NOT),
            ROW_FIELD_EQ(alu_ia, a),
            ROW_FIELD_EQ(alu_ib, b),
            ROW_FIELD_EQ(alu_ic, 0),
            ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ib_tag, static_cast<uint8_t>(tag)),
            ROW_FIELD_EQ(alu_ic_tag, 0),
            ROW_FIELD_EQ(alu_max_value, get_tag_max_value(tag)),
            ROW_FIELD_EQ(alu_sel_is_ff, is_ff ? 1 : 0),
            ROW_FIELD_EQ(alu_tag_ff_diff_inv,
                         is_ff ? 0 : FF(static_cast<uint8_t>(tag) - static_cast<uint8_t>(MemoryTag::FF)).invert()),
            ROW_FIELD_EQ(alu_sel_tag_err, is_ff ? 1 : 0),
            ROW_FIELD_EQ(alu_sel_err, is_ff ? 1 : 0))));
}

// TRUNCATE operation (SET/CAST opcodes)

// Truncation is a special case as we always have FF TaggedValue inputs:
struct TruncateTrivialTestParams {
    MemoryValue a;
    MemoryTag dst_tag;
    FF expected_result;
};

const std::vector<TruncateTrivialTestParams> TRUNCATE_TRIVIAL_TEST_PARAMS = {
    {
        .a = MemoryValue::from_tag(MemoryTag::FF, 1),
        .dst_tag = MemoryTag::U1,
        .expected_result = 1,
    },
    {
        .a = MemoryValue::from_tag(MemoryTag::FF, 7),
        .dst_tag = MemoryTag::U8,
        .expected_result = 7,
    },
    {
        .a = MemoryValue::from_tag(MemoryTag::U32, 123456789),
        .dst_tag = MemoryTag::U32,
        .expected_result = 123456789,
    },
    {
        .a = MemoryValue::from_tag(MemoryTag::U128, 1234567890123456789ULL),
        .dst_tag = MemoryTag::U64,
        .expected_result = 1234567890123456789ULL,
    },
    {
        .a = MemoryValue::from_tag(MemoryTag::U128, (uint256_t(1) << 127) + 982739482),
        .dst_tag = MemoryTag::U128,
        .expected_result = (uint256_t(1) << 127) + 982739482,
    },
    {
        .a = MemoryValue::from_tag(MemoryTag::FF, FF::modulus - 1),
        .dst_tag = MemoryTag::FF,
        .expected_result = FF::modulus - 1,
    },
};

class AluTruncateTrivialTraceGenerationTest : public AluTraceGenerationTest,
                                              public ::testing::WithParamInterface<TruncateTrivialTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest,
                         AluTruncateTrivialTraceGenerationTest,
                         ::testing::ValuesIn(TRUNCATE_TRIVIAL_TEST_PARAMS));

TEST_P(AluTruncateTrivialTraceGenerationTest, TraceGenerationTruncateTrivial)
{
    auto [a, dst_tag, expected_result] = GetParam();
    auto b = MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(dst_tag));
    auto c = MemoryValue::from_tag(dst_tag, expected_result);

    builder.process(
        {
            { .operation = AluOperation::TRUNCATE, .a = a, .b = b, .c = c },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_truncate, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_trivial, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_lt_128, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_gte_128, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_non_trivial, 0),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_TRUNCATE),
                                  ROW_FIELD_EQ(alu_ia, a),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(dst_tag)),
                                  ROW_FIELD_EQ(alu_ic, expected_result),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(dst_tag)),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(dst_tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_a_lo, 0),
                                  ROW_FIELD_EQ(alu_a_hi, 0),
                                  ROW_FIELD_EQ(alu_mid, 0),
                                  ROW_FIELD_EQ(alu_mid_bits, 0))));
}

struct TruncateNonTrivialTestParams {
    MemoryValue a;
    MemoryTag dst_tag;
    FF expected_result;
    FF expected_lo_128;
    FF expected_hi_128;
    FF expected_mid;
};

const std::vector<TruncateNonTrivialTestParams> TRUNCATE_LESS_THAN_128_TEST_PARAMS = {
    {
        .a = MemoryValue::from_tag(MemoryTag::U128, (uint256_t(98263) << 64) + 123456789987654321ULL),
        .dst_tag = MemoryTag::U64,
        .expected_result = 123456789987654321ULL,
        .expected_lo_128 = (uint256_t(98263) << 64) + 123456789987654321ULL,
        .expected_hi_128 = 0,
        .expected_mid = 98263,
    },
    {
        .a = MemoryValue::from_tag(MemoryTag::U64, (uint256_t(98263) << 32) + 1234567ULL),
        .dst_tag = MemoryTag::U32,
        .expected_result = 1234567,
        .expected_lo_128 = (98263ULL << 32) + 1234567ULL,
        .expected_hi_128 = 0,
        .expected_mid = 98263,
    },
    {
        .a = MemoryValue::from_tag(MemoryTag::U64, (uint256_t(98263) << 32) + 1234ULL),
        .dst_tag = MemoryTag::U16,
        .expected_result = 1234,
        .expected_lo_128 = (98263ULL << 32) + 1234ULL,
        .expected_hi_128 = 0,
        .expected_mid = 98263ULL << 16,
    },
    {
        .a = MemoryValue::from_tag(MemoryTag::FF, 263),
        .dst_tag = MemoryTag::U8,
        .expected_result = 7,
        .expected_lo_128 = 263,
        .expected_hi_128 = 0,
        .expected_mid = 1,
    },
    {
        .a = MemoryValue::from_tag(MemoryTag::U64, 999),
        .dst_tag = MemoryTag::U1,
        .expected_result = 1,
        .expected_lo_128 = 999,
        .expected_hi_128 = 0,
        .expected_mid = 499,
    }
};

class AluTruncateNonTrivialLT128TraceGenerationTest
    : public AluTraceGenerationTest,
      public ::testing::WithParamInterface<TruncateNonTrivialTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest,
                         AluTruncateNonTrivialLT128TraceGenerationTest,
                         ::testing::ValuesIn(TRUNCATE_LESS_THAN_128_TEST_PARAMS));

TEST_P(AluTruncateNonTrivialLT128TraceGenerationTest, TraceGenerationTruncateNonTrivialLT128)
{
    auto [a, dst_tag, expected_result, expected_lo_128, expected_hi_128, expected_mid] = GetParam();
    auto b = MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(dst_tag));
    auto c = MemoryValue::from_tag(dst_tag, expected_result);

    builder.process(
        {
            { .operation = AluOperation::TRUNCATE, .a = a, .b = b, .c = c },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_truncate, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_trivial, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_lt_128, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_gte_128, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_non_trivial, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_TRUNCATE),
                                  ROW_FIELD_EQ(alu_ia, a),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(dst_tag)),
                                  ROW_FIELD_EQ(alu_ic, expected_result),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(dst_tag)),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(dst_tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_a_lo, expected_lo_128),
                                  ROW_FIELD_EQ(alu_a_hi, expected_hi_128),
                                  ROW_FIELD_EQ(alu_mid, expected_mid),
                                  ROW_FIELD_EQ(alu_mid_bits, 128 - get_tag_bits(dst_tag)))));
}

const std::vector<TruncateNonTrivialTestParams> TRUNCATE_GREATER_THAN_128_TEST_PARAMS = {
    {
        .a = MemoryValue::from<FF>((uint256_t(98263) << 128) + (uint256_t(1111) << 64) + 123456789987654321ULL),
        .dst_tag = MemoryTag::U64,
        .expected_result = 123456789987654321ULL,
        .expected_lo_128 = (uint256_t(1111) << 64) + 123456789987654321ULL,
        .expected_hi_128 = 98263,
        .expected_mid = 1111,
    },
    {
        .a = MemoryValue::from<FF>((uint256_t(98263) << 128) + (uint256_t(1111) << 64) + 123456789),
        .dst_tag = MemoryTag::U32,
        .expected_result = 123456789,
        .expected_lo_128 = (uint256_t(1111) << 64) + 123456789,
        .expected_hi_128 = 98263,
        .expected_mid = 1111ULL << 32,
    },
    {
        .a = MemoryValue::from<FF>((uint256_t(98263) << 128) + (uint256_t(1111) << 64) + 1234),
        .dst_tag = MemoryTag::U16,
        .expected_result = 1234,
        .expected_lo_128 = (uint256_t(1111) << 64) + 1234,
        .expected_hi_128 = 98263,
        .expected_mid = 1111ULL << 48,
    },
    {
        .a = MemoryValue::from<FF>((uint256_t(98263) << 150) + (uint256_t(123456789987654321ULL) << 8) + 234),
        .dst_tag = MemoryTag::U8,
        .expected_result = 234,
        .expected_lo_128 = (uint256_t(123456789987654321ULL) << 8) + 234,
        .expected_hi_128 = 98263ULL << 22,
        .expected_mid = 123456789987654321ULL,
    }
};

class AluTruncateNonTrivialGT128TraceGenerationTest
    : public AluTraceGenerationTest,
      public ::testing::WithParamInterface<TruncateNonTrivialTestParams> {};

INSTANTIATE_TEST_SUITE_P(AluTraceGenerationTest,
                         AluTruncateNonTrivialGT128TraceGenerationTest,
                         ::testing::ValuesIn(TRUNCATE_GREATER_THAN_128_TEST_PARAMS));

TEST_P(AluTruncateNonTrivialGT128TraceGenerationTest, TraceGenerationTruncateNonTrivialGT128)
{
    auto [a, dst_tag, expected_result, expected_lo_128, expected_hi_128, expected_mid] = GetParam();
    auto b = MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(dst_tag));
    auto c = MemoryValue::from_tag(dst_tag, expected_result);

    builder.process(
        {
            { .operation = AluOperation::TRUNCATE, .a = a, .b = b, .c = c },
        },
        trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(alu_sel_op_truncate, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_trivial, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_lt_128, 0),
                                  ROW_FIELD_EQ(alu_sel_trunc_gte_128, 1),
                                  ROW_FIELD_EQ(alu_sel_trunc_non_trivial, 1),
                                  ROW_FIELD_EQ(alu_sel, 1),
                                  ROW_FIELD_EQ(alu_op_id, AVM_EXEC_OP_ID_ALU_TRUNCATE),
                                  ROW_FIELD_EQ(alu_ia, a),
                                  ROW_FIELD_EQ(alu_ia_tag, static_cast<uint8_t>(dst_tag)),
                                  ROW_FIELD_EQ(alu_ic, expected_result),
                                  ROW_FIELD_EQ(alu_ic_tag, static_cast<uint8_t>(dst_tag)),
                                  ROW_FIELD_EQ(alu_max_bits, get_tag_bits(dst_tag)),
                                  ROW_FIELD_EQ(alu_sel_tag_err, 0),
                                  ROW_FIELD_EQ(alu_a_lo, expected_lo_128),
                                  ROW_FIELD_EQ(alu_a_hi, expected_hi_128),
                                  ROW_FIELD_EQ(alu_mid, expected_mid),
                                  ROW_FIELD_EQ(alu_mid_bits, 128 - get_tag_bits(dst_tag)))));
}

} // namespace
} // namespace bb::avm2::tracegen
