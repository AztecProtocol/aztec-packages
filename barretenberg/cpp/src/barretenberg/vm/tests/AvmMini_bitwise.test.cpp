#include "AvmMini_common.test.hpp"

#include "barretenberg/numeric/uint128/uint128.hpp"
#include <algorithm>
#include <cstdint>
#include <vector>

using namespace bb;
using namespace bb::numeric;

namespace {
using namespace tests_avm;

Row common_validate_bitwise_not(std::vector<Row> const& trace,
                                FF const& a,
                                FF const& c,
                                FF const& addr_a,
                                FF const& addr_c,
                                avm_trace::AvmMemoryTag const tag)
{

    // Find the first row enabling the not selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_not == FF(1); });

    // Use the row in the main trace to find the same operation in the alu trace.
    FF clk = row->avmMini_clk;
    auto alu_row = std::ranges::find_if(trace.begin(), trace.end(), [clk](Row r) { return r.aluChip_alu_clk == clk; });

    // Check that both rows were found
    EXPECT_TRUE(row != trace.end());
    EXPECT_TRUE(alu_row != trace.end());

    // // Check that the correct result is stored at the expected memory location.
    EXPECT_EQ(row->avmMini_ic, c);
    EXPECT_EQ(row->avmMini_mem_idx_c, addr_c);
    EXPECT_EQ(row->avmMini_mem_op_c, FF(1));
    EXPECT_EQ(row->avmMini_rwc, FF(1));

    // // Check that ia and ib registers are correctly set with memory load operations.
    EXPECT_EQ(row->avmMini_ia, a);
    EXPECT_EQ(row->avmMini_mem_idx_a, addr_a);
    EXPECT_EQ(row->avmMini_mem_op_a, FF(1));
    EXPECT_EQ(row->avmMini_rwa, FF(0));

    // // Check the instruction tag
    EXPECT_EQ(row->avmMini_in_tag, FF(static_cast<uint32_t>(tag)));

    // Check that intermediate registers are correctly copied in Alu trace
    EXPECT_EQ(alu_row->aluChip_alu_ia, a);
    EXPECT_EQ(alu_row->aluChip_alu_ib, FF(0));
    EXPECT_EQ(alu_row->aluChip_alu_ic, c);

    // Check that not selector is set.
    EXPECT_EQ(row->avmMini_sel_op_not, FF(1));
    EXPECT_EQ(alu_row->aluChip_alu_op_not, FF(1));

    return *alu_row;
}
} // namespace

namespace tests_avm {
using namespace avm_trace;

class AvmMiniBitwiseTests : public ::testing::Test {
  public:
    AvmMiniTraceBuilder trace_builder;

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override
    {
        srs::init_crs_factory("../srs_db/ignition");
        trace_builder = AvmMiniTraceBuilder(); // Clean instance for every run.
    };
};

class AvmMiniBitwiseTestsU8 : public AvmMiniBitwiseTests {};
class AvmMiniBitwiseTestsU16 : public AvmMiniBitwiseTests {};
class AvmMiniBitwiseTestsU32 : public AvmMiniBitwiseTests {};
class AvmMiniBitwiseTestsU64 : public AvmMiniBitwiseTests {};
class AvmMiniBitwiseTestsU128 : public AvmMiniBitwiseTests {};

class AvmMiniBitwiseNegativeTestsFF : public AvmMiniBitwiseTests {};
class AvmMiniBitwiseNegativeTestsU8 : public AvmMiniBitwiseTests {};
class AvmMiniBitwiseNegativeTestsU16 : public AvmMiniBitwiseTests {};
class AvmMiniBitwiseNegativeTestsU32 : public AvmMiniBitwiseTests {};
class AvmMiniBitwiseNegativeTestsU64 : public AvmMiniBitwiseTests {};
class AvmMiniBitwiseNegativeTestsU128 : public AvmMiniBitwiseTests {};

/******************************************************************************
 *
 * POSITIVE TESTS
 *
 ******************************************************************************
 * See AvmMini_arithmetic.cpp for explanation of positive tests
 ******************************************************************************/

/******************************************************************************
 * Positive Tests - U8
 ******************************************************************************/

TEST_F(AvmMiniBitwiseTestsU8, BitwiseNot)
{
    // trace_builder
    uint8_t input = 1;
    trace_builder.set(input, 0, AvmMemoryTag::U8);     // Memory Layout: [1,0,0,...]
    trace_builder.bitwise_not(0, 1, AvmMemoryTag::U8); // [1,0,255,0,0,....]
    trace_builder.return_op(1, 1);
    auto trace = trace_builder.finalize();

    uint8_t res = ~input;
    auto alu_row = common_validate_bitwise_not(trace, FF(1), FF(res), FF(0), FF(1), AvmMemoryTag::U8);

    EXPECT_EQ(alu_row.aluChip_alu_u8_tag, FF(1));
    validate_trace_proof(std::move(trace));
}

TEST_F(AvmMiniBitwiseTestsU16, BitwiseNot)
{
    // trace_builder
    uint16_t input = 1;
    trace_builder.set(input, 0, AvmMemoryTag::U16);     // Memory Layout: [1,0,0,...]
    trace_builder.bitwise_not(0, 1, AvmMemoryTag::U16); // [1,0,255,0,0,....]
    trace_builder.return_op(1, 1);
    auto trace = trace_builder.finalize();

    uint16_t res = ~input;
    auto alu_row = common_validate_bitwise_not(trace, FF(1), FF(res), FF(0), FF(1), AvmMemoryTag::U16);

    EXPECT_EQ(alu_row.aluChip_alu_u16_tag, FF(1));
    validate_trace_proof(std::move(trace));
}

TEST_F(AvmMiniBitwiseTestsU32, BitwiseNot)
{
    // trace_builder
    uint32_t input = 1;
    trace_builder.set(input, 0, AvmMemoryTag::U32);     // Memory Layout: [1,0,0,...]
    trace_builder.bitwise_not(0, 1, AvmMemoryTag::U32); // [1,0,255,0,0,....]
    trace_builder.return_op(1, 1);
    auto trace = trace_builder.finalize();

    uint32_t res = ~input;
    auto alu_row = common_validate_bitwise_not(trace, FF(1), FF(res), FF(0), FF(1), AvmMemoryTag::U32);

    EXPECT_EQ(alu_row.aluChip_alu_u32_tag, FF(1));
    validate_trace_proof(std::move(trace));
}

TEST_F(AvmMiniBitwiseTestsU64, BitwiseNot)
{
    // trace_builder
    uint64_t input = 1;
    trace_builder.set(input, 0, AvmMemoryTag::U64);     // Memory Layout: [1,0,0,...]
    trace_builder.bitwise_not(0, 1, AvmMemoryTag::U64); // [1,0,255,0,0,....]
    trace_builder.return_op(1, 1);
    auto trace = trace_builder.finalize();

    uint64_t res = ~input;
    auto alu_row = common_validate_bitwise_not(trace, FF(1), FF(res), FF(0), FF(1), AvmMemoryTag::U64);

    EXPECT_EQ(alu_row.aluChip_alu_u64_tag, FF(1));
    validate_trace_proof(std::move(trace));
}

TEST_F(AvmMiniBitwiseTestsU128, BitwiseNot)
{
    // trace_builder
    uint128_t input = 1;
    trace_builder.set(input, 0, AvmMemoryTag::U128);     // Memory Layout: [1,0,0,...]
    trace_builder.bitwise_not(0, 1, AvmMemoryTag::U128); // [1,0,255,0,0,....]
    trace_builder.return_op(1, 1);
    auto trace = trace_builder.finalize();

    uint128_t res = ~input;
    auto alu_row =
        common_validate_bitwise_not(trace, FF(1), FF(uint256_t::from_uint128(res)), FF(0), FF(1), AvmMemoryTag::U128);

    EXPECT_EQ(alu_row.aluChip_alu_u128_tag, FF(1));
    validate_trace_proof(std::move(trace));
}

/******************************************************************************
 *
 * NEGATIVE TESTS - Finite Field Type
 *
 ******************************************************************************
 * See AvmMini_arithmetic.cpp for explanation of negative tests
 ******************************************************************************/

std::vector<Row> gen_mutated_trace_not(FF const& a, FF const& c_mutated, avm_trace::AvmMemoryTag tag)
{
    auto trace_builder = avm_trace::AvmMiniTraceBuilder();
    trace_builder.set(uint128_t{ a }, 0, tag);
    trace_builder.bitwise_not(0, 1, tag);
    trace_builder.halt();
    auto trace = trace_builder.finalize();

    auto select_row = [](Row r) { return r.avmMini_sel_op_not == FF(1); };
    mutate_ic_in_trace(trace, select_row, c_mutated, true);

    return trace;
}
/******************************************************************************
 * Negative Tests - FF
 ******************************************************************************/

// This fails bitwise operations should not be used on FF-sized operands
TEST_F(AvmMiniBitwiseNegativeTestsFF, BitwiseNot)
{
    uint128_t input = 1;
    std::vector<Row> trace = gen_mutated_trace_not(
        FF{ uint256_t::from_uint128(input) }, FF{ uint256_t::from_uint128(~input) }, AvmMemoryTag::FF);
    // EXPECT_EQ(alu_row.aluChip_alu_ff_tag, FF(1));
    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "ALU_FF_NOT_XOR");
}

TEST_F(AvmMiniBitwiseNegativeTestsU8, BitwiseNot)
{
    std::vector<Row> trace = gen_mutated_trace_not(FF{ 1 }, FF{ 2 }, AvmMemoryTag::U8);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "ALU_NOT_OP");
    validate_trace_proof(std::move(trace));
}

TEST_F(AvmMiniBitwiseNegativeTestsU16, BitwiseNot)
{
    std::vector<Row> trace = gen_mutated_trace_not(FF{ 1 }, FF{ 2 }, AvmMemoryTag::U16);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "ALU_NOT_OP");
    validate_trace_proof(std::move(trace));
}
TEST_F(AvmMiniBitwiseNegativeTestsU64, BitwiseNot)
{
    std::vector<Row> trace = gen_mutated_trace_not(FF{ 1 }, FF{ 2 }, AvmMemoryTag::U64);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "ALU_NOT_OP");
    validate_trace_proof(std::move(trace));
}

TEST_F(AvmMiniBitwiseNegativeTestsU128, BitwiseNot)
{
    std::vector<Row> trace = gen_mutated_trace_not(FF{ 1 }, FF{ 2 }, AvmMemoryTag::U128);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "ALU_NOT_OP");
    validate_trace_proof(std::move(trace));
}
} // namespace tests_avm
