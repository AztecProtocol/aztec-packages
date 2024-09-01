#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm/avm/tests/helpers.test.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"
#include "common.test.hpp"
#include <array>
#include <cstdint>

namespace tests_avm {

using namespace bb;
using namespace bb::avm_trace;

namespace {

void common_validate_arithmetic_op(Row const& main_row,
                                   Row const& alu_row,
                                   FF const& a,
                                   FF const& b,
                                   FF const& c,
                                   FF const& addr_a,
                                   FF const& addr_b,
                                   FF const& addr_c,
                                   avm_trace::AvmMemoryTag const tag)
{
    // Check that the correct result is stored at the expected memory location.
    EXPECT_EQ(main_row.main_ic, c);
    EXPECT_EQ(main_row.main_mem_addr_c, addr_c);
    EXPECT_EQ(main_row.main_sel_mem_op_c, FF(1));
    EXPECT_EQ(main_row.main_rwc, FF(1));

    // Check that ia and ib registers are correctly set with memory load operations.
    EXPECT_EQ(main_row.main_ia, a);
    EXPECT_EQ(main_row.main_mem_addr_a, addr_a);
    EXPECT_EQ(main_row.main_sel_mem_op_a, FF(1));
    EXPECT_EQ(main_row.main_rwa, FF(0));
    EXPECT_EQ(main_row.main_ib, b);
    EXPECT_EQ(main_row.main_mem_addr_b, addr_b);
    EXPECT_EQ(main_row.main_sel_mem_op_b, FF(1));
    EXPECT_EQ(main_row.main_rwb, FF(0));

    // Check the read instruction tag
    EXPECT_EQ(main_row.main_r_in_tag, FF(static_cast<uint32_t>(tag)));

    // Check that intermediate registers are correctly copied in Alu trace
    EXPECT_EQ(alu_row.alu_ia, a);
    EXPECT_EQ(alu_row.alu_ib, b);
    EXPECT_EQ(alu_row.alu_ic, c);

    // Check that no error is raised
    EXPECT_EQ(main_row.main_tag_err, FF(0));
    EXPECT_EQ(main_row.main_op_err, FF(0));
}

Row common_validate_add(std::vector<Row> const& trace,
                        FF const& a,
                        FF const& b,
                        FF const& c,
                        FF const& addr_a,
                        FF const& addr_b,
                        FF const& addr_c,
                        avm_trace::AvmMemoryTag const tag)
{
    // Find the first row enabling the addition selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_add == FF(1); });

    // Find the corresponding Alu trace row
    auto clk = row->main_clk;
    auto alu_row = std::ranges::find_if(trace.begin(), trace.end(), [clk](Row r) { return r.alu_clk == clk; });

    // Check that both rows were found
    EXPECT_TRUE(row != trace.end());
    EXPECT_TRUE(alu_row != trace.end());

    common_validate_arithmetic_op(*row, *alu_row, a, b, c, addr_a, addr_b, addr_c, tag);
    EXPECT_EQ(row->main_w_in_tag, FF(static_cast<uint32_t>(tag)));

    // Check that addition selector is set.
    EXPECT_EQ(row->main_sel_op_add, FF(1));
    EXPECT_EQ(alu_row->alu_op_add, FF(1));

    return *alu_row;
}

Row common_validate_sub(std::vector<Row> const& trace,
                        FF const& a,
                        FF const& b,
                        FF const& c,
                        FF const& addr_a,
                        FF const& addr_b,
                        FF const& addr_c,
                        avm_trace::AvmMemoryTag const tag)
{
    // Find the first row enabling the subtraction selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sub == FF(1); });

    // Find the corresponding Alu trace row
    auto clk = row->main_clk;
    auto alu_row = std::ranges::find_if(trace.begin(), trace.end(), [clk](Row r) { return r.alu_clk == clk; });

    // Check that both rows were found
    EXPECT_TRUE(row != trace.end());
    EXPECT_TRUE(alu_row != trace.end());

    common_validate_arithmetic_op(*row, *alu_row, a, b, c, addr_a, addr_b, addr_c, tag);
    EXPECT_EQ(row->main_w_in_tag, FF(static_cast<uint32_t>(tag)));

    // Check that subtraction selector is set.
    EXPECT_EQ(row->main_sel_op_sub, FF(1));
    EXPECT_EQ(alu_row->alu_op_sub, FF(1));

    return *alu_row;
}

size_t common_validate_mul(std::vector<Row> const& trace,
                           FF const& a,
                           FF const& b,
                           FF const& c,
                           FF const& addr_a,
                           FF const& addr_b,
                           FF const& addr_c,
                           avm_trace::AvmMemoryTag const tag)
{
    // Find the first row enabling the multiplication selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_mul == FF(1); });

    // Find the corresponding Alu trace row
    auto clk = row->main_clk;
    auto alu_row = std::ranges::find_if(trace.begin(), trace.end(), [clk](Row r) { return r.alu_clk == clk; });

    // Check that both rows were found
    EXPECT_TRUE(row != trace.end());
    EXPECT_TRUE(alu_row != trace.end());

    common_validate_arithmetic_op(*row, *alu_row, a, b, c, addr_a, addr_b, addr_c, tag);
    EXPECT_EQ(row->main_w_in_tag, FF(static_cast<uint32_t>(tag)));

    // Check that multiplication selector is set.
    EXPECT_EQ(row->main_sel_op_mul, FF(1));
    EXPECT_EQ(alu_row->alu_op_mul, FF(1));

    return static_cast<size_t>(alu_row - trace.begin());
}

size_t common_validate_eq(std::vector<Row> const& trace,
                          FF const& a,
                          FF const& b,
                          FF const& c,
                          FF const& addr_a,
                          FF const& addr_b,
                          FF const& addr_c,
                          avm_trace::AvmMemoryTag const tag)
{
    // Find the first row enabling the equality selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_eq == FF(1); });

    // Find the corresponding Alu trace row
    auto clk = row->main_clk;
    auto alu_row = std::ranges::find_if(trace.begin(), trace.end(), [clk](Row r) { return r.alu_clk == clk; });

    // Check that both rows were found
    EXPECT_TRUE(row != trace.end());
    EXPECT_TRUE(alu_row != trace.end());

    common_validate_arithmetic_op(*row, *alu_row, a, b, c, addr_a, addr_b, addr_c, tag);
    EXPECT_EQ(row->main_w_in_tag, FF(static_cast<uint32_t>(AvmMemoryTag::U8)));

    // Check that equality selector is set.
    EXPECT_EQ(row->main_sel_op_eq, FF(1));
    EXPECT_EQ(alu_row->alu_op_eq, FF(1));

    return static_cast<size_t>(alu_row - trace.begin());
}

size_t common_validate_div(std::vector<Row> const& trace,
                           FF const& a,
                           FF const& b,
                           FF const& c,
                           FF const& addr_a,
                           FF const& addr_b,
                           FF const& addr_c,
                           avm_trace::AvmMemoryTag const tag)
{
    // Find the first row enabling the division selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_div == FF(1); });

    // Find the corresponding Alu trace row
    auto clk = row->main_clk;
    auto alu_row = std::ranges::find_if(trace.begin(), trace.end(), [clk](Row r) { return r.alu_clk == clk; });

    // Check that both rows were found
    EXPECT_TRUE(row != trace.end());
    EXPECT_TRUE(alu_row != trace.end());

    common_validate_arithmetic_op(*row, *alu_row, a, b, c, addr_a, addr_b, addr_c, tag);
    EXPECT_EQ(row->main_w_in_tag, FF(static_cast<uint32_t>(tag)));

    // Check that division selector is set.
    EXPECT_EQ(alu_row->alu_op_div, FF(1));

    return static_cast<size_t>(alu_row - trace.begin());
}
} // anonymous namespace

class AvmArithmeticTests : public ::testing::Test {
  public:
    AvmArithmeticTests()
        : public_inputs(generate_base_public_inputs())
        , trace_builder(AvmTraceBuilder(public_inputs))
    {
        srs::init_crs_factory("../srs_db/ignition");
    }

    VmPublicInputs public_inputs;
    AvmTraceBuilder trace_builder;

    void gen_trace_builder(std::vector<FF> const& calldata)
    {
        trace_builder = AvmTraceBuilder(public_inputs, {}, 0, calldata);
    }

    // Generate a trace with an EQ opcode operation.
    std::vector<Row> gen_trace_eq(uint128_t const& a,
                                  uint128_t const& b,
                                  uint32_t const& addr_a,
                                  uint32_t const& addr_b,
                                  uint32_t const& addr_c,
                                  avm_trace::AvmMemoryTag tag)
    {
        trace_builder.op_set(0, a, addr_a, tag);
        trace_builder.op_set(0, b, addr_b, tag);
        trace_builder.op_eq(0, addr_a, addr_b, addr_c, tag);
        trace_builder.op_return(0, 0, 0);
        return trace_builder.finalize();
    }

    // This function generates a mutated trace of an addition where a and b are the passed inputs.
    // a and b are stored in memory indices 0 and 1. c_mutated is the wrong result of the addition
    // and the memory and alu trace are created consistently with the wrong value c_mutated.
    std::vector<Row> gen_mutated_trace_add(FF const& a, FF const& b, FF const& c_mutated, avm_trace::AvmMemoryTag tag)
    {
        trace_builder.op_set(0, uint128_t{ a }, 0, tag);
        trace_builder.op_set(0, uint128_t{ b }, 1, tag);
        trace_builder.op_add(0, 0, 1, 2, tag);
        trace_builder.op_return(0, 0, 0);
        auto trace = trace_builder.finalize();

        auto select_row = [](Row r) { return r.main_sel_op_add == FF(1); };
        mutate_ic_in_trace(trace, select_row, c_mutated, true);

        return trace;
    }

    // This function generates a mutated trace of a subtraction where a and b are the passed inputs.
    // a and b are stored in memory indices 0 and 1. c_mutated is the wrong result of the subtraction
    // and the memory and alu trace are created consistently with the wrong value c_mutated.
    std::vector<Row> gen_mutated_trace_sub(FF const& a, FF const& b, FF const& c_mutated, avm_trace::AvmMemoryTag tag)
    {
        trace_builder.op_set(0, uint128_t{ a }, 0, tag);
        trace_builder.op_set(0, uint128_t{ b }, 1, tag);
        trace_builder.op_sub(0, 0, 1, 2, tag);
        trace_builder.op_return(0, 0, 0);
        auto trace = trace_builder.finalize();

        auto select_row = [](Row r) { return r.main_sel_op_sub == FF(1); };
        mutate_ic_in_trace(trace, select_row, c_mutated, true);

        return trace;
    }

    // This function generates a mutated trace of a multiplication where a and b are the passed inputs.
    // a and b are stored in memory indices 0 and 1. c_mutated is the wrong result of the multiplication
    // and the memory and alu trace are created consistently with the wrong value c_mutated.
    std::vector<Row> gen_mutated_trace_mul(FF const& a, FF const& b, FF const& c_mutated, avm_trace::AvmMemoryTag tag)
    {
        trace_builder.op_set(0, uint128_t{ a }, 0, tag);
        trace_builder.op_set(0, uint128_t{ b }, 1, tag);
        trace_builder.op_mul(0, 0, 1, 2, tag);
        trace_builder.op_return(0, 0, 0);
        auto trace = trace_builder.finalize();

        auto select_row = [](Row r) { return r.main_sel_op_mul == FF(1); };
        mutate_ic_in_trace(trace, select_row, c_mutated, true);

        return trace;
    }

    // This function generates a mutated trace of an equality check where a and b are the passed inputs.
    // a and b are stored in memory indices 0 and 1 and c contains the boolean value of the equality check.
    // Here we mutate c to be an incorrect evaluation of the equality and the memory and alu trace are
    // created consistently with the wrong value c_mutated.
    // Additionally, we can also mutate the value stored in inv_diff where inv_diff is (a - b)^-1
    std::vector<Row> gen_mutated_trace_eq(
        FF const& a, FF const& b, FF const& c_mutated, FF const& mutated_inv_diff, avm_trace::AvmMemoryTag tag)
    {
        trace_builder.op_set(0, uint128_t{ a }, 0, tag);
        trace_builder.op_set(0, uint128_t{ b }, 1, tag);
        trace_builder.op_eq(0, 0, 1, 2, tag);
        trace_builder.op_return(0, 0, 0);
        auto trace = trace_builder.finalize();

        auto select_row = [](Row r) { return r.main_sel_op_eq == FF(1); };
        mutate_ic_in_trace(trace, select_row, c_mutated, true);

        auto main_trace_row = std::ranges::find_if(trace.begin(), trace.end(), select_row);
        auto main_clk = main_trace_row->main_clk;
        auto alu_row =
            std::ranges::find_if(trace.begin(), trace.end(), [main_clk](Row r) { return r.alu_clk == main_clk; });

        main_trace_row->cmp_op_eq_diff_inv = mutated_inv_diff;
        alu_row->cmp_op_eq_diff_inv = mutated_inv_diff;

        return trace;
    }
};

class AvmArithmeticTestsFF : public AvmArithmeticTests {};
class AvmArithmeticTestsU8 : public AvmArithmeticTests {};
class AvmArithmeticTestsU16 : public AvmArithmeticTests {};
class AvmArithmeticTestsU32 : public AvmArithmeticTests {};
class AvmArithmeticTestsU64 : public AvmArithmeticTests {};
class AvmArithmeticTestsU128 : public AvmArithmeticTests {};
class AvmArithmeticTestsDiv : public AvmArithmeticTests, public testing::WithParamInterface<ThreeOpParamRow> {};

class AvmArithmeticNegativeTestsFF : public AvmArithmeticTests {
  protected:
    void SetUp() override { GTEST_SKIP(); }
};
class AvmArithmeticNegativeTestsU8 : public AvmArithmeticTests {
  protected:
    void SetUp() override { GTEST_SKIP(); }
};
class AvmArithmeticNegativeTestsU16 : public AvmArithmeticTests {
  protected:
    void SetUp() override { GTEST_SKIP(); }
};
class AvmArithmeticNegativeTestsU32 : public AvmArithmeticTests {
  protected:
    void SetUp() override { GTEST_SKIP(); }
};
class AvmArithmeticNegativeTestsU64 : public AvmArithmeticTests {
  protected:
    void SetUp() override { GTEST_SKIP(); }
};
class AvmArithmeticNegativeTestsU128 : public AvmArithmeticTests {
  protected:
    void SetUp() override { GTEST_SKIP(); }
};

std::vector<AvmMemoryTag> uint_mem_tags{
    { AvmMemoryTag::U8, AvmMemoryTag::U16, AvmMemoryTag::U32, AvmMemoryTag::U64, AvmMemoryTag::U128 }
};
std::vector<std::array<FF, 3>> positive_op_div_test_values = { {
    { FF(10), FF(5), FF(2) },
    { FF(5323), FF(5323), FF(1) },
    { FF(13793), FF(10590617LLU), FF(0) },
    { FF(0x7bff744e3cdf79LLU), FF(0x14ccccccccb6LLU), FF(1526) },
    { uint256_t::from_uint128((uint128_t{ 0x1006021301080000 } << 64) + uint128_t{ 0x000000000000001080876844827 }),
      uint256_t::from_uint128(uint128_t{ 0xb900000000000001 }),
      uint256_t::from_uint128(uint128_t{ 0x162c4ad3b97863a1 }) },
} };
/******************************************************************************
 *
 * POSITIVE TESTS
 *
 ******************************************************************************
 * The positive tests aim at testing that a genuinely generated execution trace
 * is correct, i.e., the evaluation is correct and the proof passes.
 * Positive refers to the proof system and not that the arithmetic operation has valid
 * operands. A division by zero needs to be handled by the AVM and needs to raise an error.
 * This will be positively tested, i.e., that the error is correctly raised.
 *
 * We isolate each operation addition, subtraction, multiplication and division
 * by having dedicated unit test for each of them.
 * In any positive test, we also verify that the main trace contains
 * a write memory operation for the intermediate register Ic at the
 * correct address. This operation belongs to the same row as the arithmetic
 * operation.
 *
 * Finding the row pertaining to the arithmetic operation is done through
 * a scan of all rows and stopping at the first one with the corresponding
 * operator selector. This mechanism is used with the hope that these unit tests
 * will still correctly work along the development of the AVM.
 ******************************************************************************/

/******************************************************************************
 * Positive Tests - FF
 ******************************************************************************/

// Test on basic addition over finite field type.
TEST_F(AvmArithmeticTestsFF, addition)
{
    std::vector<FF> const calldata = { 37, 4, 11 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 3, 0);

    //                                   Memory layout:    [37,4,11,0,0,0,....]
    trace_builder.op_add(0, 0, 1, 4, AvmMemoryTag::FF); // [37,4,11,0,41,0,....]
    trace_builder.op_return(0, 0, 5);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace, FF(37), FF(4), FF(41), FF(0), FF(1), FF(4), AvmMemoryTag::FF);

    EXPECT_EQ(alu_row.alu_ff_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    std::vector<FF> const returndata = { 37, 4, 11, 0, 41 };

    validate_trace(std::move(trace), public_inputs, calldata, returndata, true);
}

// Test on basic subtraction over finite field type.
TEST_F(AvmArithmeticTestsFF, subtraction)
{
    std::vector<FF> const calldata = { 8, 4, 17 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 3, 0);

    //                             Memory layout:    [8,4,17,0,0,0,....]
    trace_builder.op_sub(0, 2, 0, 1, AvmMemoryTag::FF); // [8,9,17,0,0,0....]
    trace_builder.op_return(0, 0, 3);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_sub(trace, FF(17), FF(8), FF(9), FF(2), FF(0), FF(1), AvmMemoryTag::FF);

    EXPECT_EQ(alu_row.alu_ff_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    std::vector<FF> const returndata = { 8, 9, 17 };
    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Test on basic multiplication over finite field type.
TEST_F(AvmArithmeticTestsFF, multiplication)
{
    std::vector<FF> const calldata = { 5, 0, 20 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 3, 0);

    //                             Memory layout:    [5,0,20,0,0,0,....]
    trace_builder.op_mul(0, 2, 0, 1, AvmMemoryTag::FF); // [5,100,20,0,0,0....]
    trace_builder.op_return(0, 0, 3);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_mul(trace, FF(20), FF(5), FF(100), FF(2), FF(0), FF(1), AvmMemoryTag::FF);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_ff_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    std::vector<FF> const returndata = { 5, 100, 20 };
    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Test on multiplication by zero over finite field type.
TEST_F(AvmArithmeticTestsFF, multiplicationByZero)
{
    std::vector<FF> const calldata = { 127 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 1, 0);

    //                             Memory layout:    [127,0,0,0,0,0,....]
    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::FF); // [127,0,0,0,0,0....]
    trace_builder.op_return(0, 0, 3);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_mul(trace, FF(127), FF(0), FF(0), FF(0), FF(1), FF(2), AvmMemoryTag::FF);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_ff_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    std::vector<FF> const returndata = { 127, 0, 0 };
    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Test on basic division over finite field type.
TEST_F(AvmArithmeticTestsFF, fDivision)
{
    std::vector<FF> const calldata = { 15, 315 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 2, 0);

    //                  Memory layout:    [15,315,0,0,0,0,....]
    trace_builder.op_fdiv(0, 1, 0, 2); // [15,315,21,0,0,0....]
    trace_builder.op_return(0, 0, 3);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the fdiv selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->main_ic, FF(21));
    EXPECT_EQ(row->main_mem_addr_c, FF(2));
    EXPECT_EQ(row->main_sel_mem_op_c, FF(1));
    EXPECT_EQ(row->main_rwc, FF(1));

    std::vector<FF> const returndata = { 15, 315, 21 };
    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Test on division with zero numerator over finite field type.
TEST_F(AvmArithmeticTestsFF, fDivisionNumeratorZero)
{
    std::vector<FF> const calldata = { 15 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 1, 0);

    //                  Memory layout:    [15,0,0,0,0,0,....]
    trace_builder.op_fdiv(0, 1, 0, 0); // [0,0,0,0,0,0....]
    trace_builder.op_return(0, 0, 3);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the fdiv selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->main_ic, FF(0));
    EXPECT_EQ(row->main_mem_addr_c, FF(0));
    EXPECT_EQ(row->main_sel_mem_op_c, FF(1));
    EXPECT_EQ(row->main_rwc, FF(1));

    std::vector<FF> const returndata = { 0, 0, 0 };
    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Test on division by zero over finite field type.
// We check that the operator error flag is raised.
TEST_F(AvmArithmeticTestsFF, fDivisionByZeroError)
{
    std::vector<FF> const calldata = { 15 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 1, 0);

    //                  Memory layout:    [15,0,0,0,0,0,....]
    trace_builder.op_fdiv(0, 0, 1, 2); // [15,0,0,0,0,0....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the fdiv selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->main_ic, FF(0));
    EXPECT_EQ(row->main_mem_addr_c, FF(2));
    EXPECT_EQ(row->main_sel_mem_op_c, FF(1));
    EXPECT_EQ(row->main_rwc, FF(1));
    EXPECT_EQ(row->main_op_err, FF(1));

    validate_trace(std::move(trace), public_inputs, calldata);
}

// Test on division of zero by zero over finite field type.
// We check that the operator error flag is raised.
TEST_F(AvmArithmeticTestsFF, fDivisionZeroByZeroError)
{
    //                  Memory layout:    [0,0,0,0,0,0,....]
    trace_builder.op_fdiv(0, 0, 1, 2); // [0,0,0,0,0,0....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the fdiv selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->main_ic, FF(0));
    EXPECT_EQ(row->main_mem_addr_c, FF(2));
    EXPECT_EQ(row->main_sel_mem_op_c, FF(1));
    EXPECT_EQ(row->main_rwc, FF(1));
    EXPECT_EQ(row->main_op_err, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Testing an execution of the different arithmetic opcodes over finite field
// and finishing with a division by zero. The chosen combination is arbitrary.
// We only test that the proof can be correctly generated and verified.
// No check on the evaluation is performed here.
TEST_F(AvmArithmeticTestsFF, mixedOperationsWithError)
{
    std::vector<FF> const calldata = { 45, 23, 12 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 3, 2);

    //                             Memory layout:    [0,0,45,23,12,0,0,0,....]
    trace_builder.op_add(0, 2, 3, 4, AvmMemoryTag::FF); // [0,0,45,23,68,0,0,0,....]
    trace_builder.op_add(0, 4, 5, 5, AvmMemoryTag::FF); // [0,0,45,23,68,68,0,0,....]
    trace_builder.op_add(0, 5, 5, 5, AvmMemoryTag::FF); // [0,0,45,23,68,136,0,0,....]
    trace_builder.op_add(0, 5, 6, 7, AvmMemoryTag::FF); // [0,0,45,23,68,136,0,136,0....]
    trace_builder.op_sub(0, 7, 6, 8, AvmMemoryTag::FF); // [0,0,45,23,68,136,0,136,136,0....]
    trace_builder.op_mul(0, 8, 8, 8, AvmMemoryTag::FF); // [0,0,45,23,68,136,0,136,136^2,0....]
    trace_builder.op_fdiv(0, 3, 5, 1);                  // [0,23*136^(-1),45,23,68,136,0,136,136^2,0....]
    trace_builder.op_fdiv(0, 1, 1, 9);                  // [0,23*136^(-1),45,23,68,136,0,136,136^2,1,0....]
    trace_builder.op_fdiv(0, 9, 0, 4); // [0,23*136^(-1),45,23,1/0,136,0,136,136^2,1,0....] Error: division by 0
    trace_builder.op_return(0, 0, 0);

    auto trace = trace_builder.finalize();
    validate_trace(std::move(trace), public_inputs, calldata, {}, true);
}

// Test of equality on FF elements
TEST_F(AvmArithmeticTestsFF, equality)
{
    // Pick a field-sized number
    FF elem = FF::modulus - FF(1);
    std::vector<FF> const calldata = { elem, elem };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 2, 0);
    trace_builder.op_eq(0, 0, 1, 2, AvmMemoryTag::FF); // Memory Layout [q - 1, q - 1, 1, 0..]
    trace_builder.op_return(0, 0, 3);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_eq(trace, elem, elem, FF(1), FF(0), FF(1), FF(2), AvmMemoryTag::FF);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_ff_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(0)); // Expect 0 as inv of (q-1) - (q-1)

    std::vector<FF> const returndata = { elem, elem, 1 };
    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Test correct non-equality of FF elements
TEST_F(AvmArithmeticTestsFF, nonEquality)
{
    FF elem = FF::modulus - FF(1);
    std::vector<FF> const calldata = { elem, elem + FF(1) };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 2, 0);
    trace_builder.op_eq(0, 0, 1, 2, AvmMemoryTag::FF); // Memory Layout [q - 1, q, 0, 0..]
    trace_builder.op_return(0, 0, 3);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_eq(trace, elem, FF(0), FF(0), FF(0), FF(1), FF(2), AvmMemoryTag::FF);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_ff_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(-1).invert());

    std::vector<FF> const returndata = { elem, 0, 0 };
    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

TEST_P(AvmArithmeticTestsDiv, division)
{
    const auto [operands, mem_tag] = GetParam();
    const auto [a, b, output] = operands;
    trace_builder.op_set(0, uint128_t(a), 0, mem_tag);
    trace_builder.op_set(0, uint128_t(b), 1, mem_tag);
    trace_builder.op_div(0, 0, 1, 2, mem_tag);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    common_validate_div(trace, a, b, output, 0, 1, 2, mem_tag);

    validate_trace(std::move(trace), public_inputs);
}
INSTANTIATE_TEST_SUITE_P(AvmArithmeticTestsDiv,
                         AvmArithmeticTestsDiv,
                         testing::ValuesIn(gen_three_op_params(positive_op_div_test_values, uint_mem_tags)));

// Test on division by zero over U128.
// We check that the operator error flag is raised.
TEST_F(AvmArithmeticTests, DivisionByZeroError)
{
    trace_builder.op_set(0, 100, 0, AvmMemoryTag::U128);
    trace_builder.op_set(0, 0, 1, AvmMemoryTag::U128);
    trace_builder.op_div(0, 0, 1, 2, AvmMemoryTag::U128);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the div selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_div == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->main_ic, FF(0));
    EXPECT_EQ(row->main_mem_addr_c, FF(2));
    EXPECT_EQ(row->main_sel_mem_op_c, FF(1));
    EXPECT_EQ(row->main_rwc, FF(1));
    EXPECT_EQ(row->main_op_err, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

/******************************************************************************
 * Positive Tests - U8
 ******************************************************************************/

// Test on basic addition over u8 type.
TEST_F(AvmArithmeticTestsU8, addition)
{
    // trace_builder
    trace_builder.op_set(0, 62, 0, AvmMemoryTag::U8);
    trace_builder.op_set(0, 29, 1, AvmMemoryTag::U8);

    //                             Memory layout:    [62,29,0,0,0,....]
    trace_builder.op_add(0, 0, 1, 2, AvmMemoryTag::U8); // [62,29,91,0,0,....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace, FF(62), FF(29), FF(91), FF(0), FF(1), FF(2), AvmMemoryTag::U8);

    EXPECT_EQ(alu_row.alu_u8_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic addition over u8 type with carry.
TEST_F(AvmArithmeticTestsU8, additionCarry)
{
    // trace_builder
    trace_builder.op_set(0, 159, 0, AvmMemoryTag::U8);
    trace_builder.op_set(0, 100, 1, AvmMemoryTag::U8);

    //                             Memory layout:    [159,100,0,0,0,....]
    trace_builder.op_add(0, 0, 1, 2, AvmMemoryTag::U8); // [159,100,3,0,0,....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace, FF(159), FF(100), FF(3), FF(0), FF(1), FF(2), AvmMemoryTag::U8);

    EXPECT_EQ(alu_row.alu_u8_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic subtraction over u8 type.
TEST_F(AvmArithmeticTestsU8, subtraction)
{
    // trace_builder
    trace_builder.op_set(0, 162, 0, AvmMemoryTag::U8);
    trace_builder.op_set(0, 29, 1, AvmMemoryTag::U8);

    //                             Memory layout:    [162,29,0,0,0,....]
    trace_builder.op_sub(0, 0, 1, 2, AvmMemoryTag::U8); // [162,29,133,0,0,....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_sub(trace, FF(162), FF(29), FF(133), FF(0), FF(1), FF(2), AvmMemoryTag::U8);

    EXPECT_EQ(alu_row.alu_u8_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on subtraction over u8 type with carry.
// For a subtraction a - b = c, there is a carry flag iff a < b (equivalent to a < c)
TEST_F(AvmArithmeticTestsU8, subtractionCarry)
{
    // trace_builder
    trace_builder.op_set(0, 5, 0, AvmMemoryTag::U8);
    trace_builder.op_set(0, 29, 1, AvmMemoryTag::U8);

    //                             Memory layout:    [5,29,0,0,0,....]
    trace_builder.op_sub(0, 0, 1, 2, AvmMemoryTag::U8); // [5,29,232,0,0,....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_sub(trace, FF(5), FF(29), FF(232), FF(0), FF(1), FF(2), AvmMemoryTag::U8);

    EXPECT_EQ(alu_row.alu_u8_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic multiplication over u8 type.
TEST_F(AvmArithmeticTestsU8, multiplication)
{
    // trace_builder
    trace_builder.op_set(0, 13, 0, AvmMemoryTag::U8);
    trace_builder.op_set(0, 15, 1, AvmMemoryTag::U8);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U8);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_mul(trace, FF(13), FF(15), FF(195), FF(0), FF(1), FF(2), AvmMemoryTag::U8);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u8_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on multiplication over u8 type with overflow.
TEST_F(AvmArithmeticTestsU8, multiplicationOverflow)
{
    // trace_builder
    trace_builder.op_set(0, 200, 0, AvmMemoryTag::U8);
    trace_builder.op_set(0, 170, 1, AvmMemoryTag::U8);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U8);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_mul(trace, FF(200), FF(170), FF(208), FF(0), FF(1), FF(2), AvmMemoryTag::U8);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u8_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test of equality on u8 elements
TEST_F(AvmArithmeticTestsU8, equality)
{
    auto trace = gen_trace_eq(128, 128, 0, 1, 2, AvmMemoryTag::U8);

    auto alu_row_index = common_validate_eq(trace, FF(128), FF(128), FF(1), FF(0), FF(1), FF(2), AvmMemoryTag::U8);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u8_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(0));
    validate_trace(std::move(trace), public_inputs);
}

// Test correct non-equality of U8 elements
TEST_F(AvmArithmeticTestsU8, nonEquality)
{
    auto trace = gen_trace_eq(84, 200, 12, 15, 28, AvmMemoryTag::U8);

    auto alu_row_index = common_validate_eq(trace, 84, 200, FF(0), FF(12), FF(15), FF(28), AvmMemoryTag::U8);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u8_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(-116).invert());
    validate_trace(std::move(trace), public_inputs);
}

/******************************************************************************
 * Positive Tests - U16
 ******************************************************************************/

// Test on basic addition over u16 type.
TEST_F(AvmArithmeticTestsU16, addition)
{
    // trace_builder
    trace_builder.op_set(0, 1775, 119, AvmMemoryTag::U16);
    trace_builder.op_set(0, 33005, 546, AvmMemoryTag::U16);

    trace_builder.op_add(0, 546, 119, 5, AvmMemoryTag::U16);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row =
        common_validate_add(trace, FF(33005), FF(1775), FF(34780), FF(546), FF(119), FF(5), AvmMemoryTag::U16);

    EXPECT_EQ(alu_row.alu_u16_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic addition over u16 type with carry.
TEST_F(AvmArithmeticTestsU16, additionCarry)
{
    // trace_builder
    trace_builder.op_set(0, UINT16_MAX - 982, 0, AvmMemoryTag::U16);
    trace_builder.op_set(0, 1000, 1, AvmMemoryTag::U16);

    trace_builder.op_add(0, 1, 0, 0, AvmMemoryTag::U16);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row =
        common_validate_add(trace, FF(1000), FF(UINT16_MAX - 982), FF(17), FF(1), FF(0), FF(0), AvmMemoryTag::U16);

    EXPECT_EQ(alu_row.alu_u16_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic subtraction over u16 type.
TEST_F(AvmArithmeticTestsU16, subtraction)
{
    // trace_builder
    trace_builder.op_set(0, 1775, 119, AvmMemoryTag::U16);
    trace_builder.op_set(0, 33005, 546, AvmMemoryTag::U16);

    trace_builder.op_sub(0, 546, 119, 5, AvmMemoryTag::U16);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row =
        common_validate_sub(trace, FF(33005), FF(1775), FF(31230), FF(546), FF(119), FF(5), AvmMemoryTag::U16);

    EXPECT_EQ(alu_row.alu_u16_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic subtraction over u16 type with carry.
// For a subtraction a - b = c, there is a carry flag iff a < b (equivalent to a < c)
TEST_F(AvmArithmeticTestsU16, subtractionCarry)
{
    // trace_builder
    trace_builder.op_set(0, UINT16_MAX - 982, 0, AvmMemoryTag::U16);
    trace_builder.op_set(0, 1000, 1, AvmMemoryTag::U16);

    trace_builder.op_sub(0, 1, 0, 0, AvmMemoryTag::U16);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row =
        common_validate_sub(trace, FF(1000), FF(UINT16_MAX - 982), FF(1983), FF(1), FF(0), FF(0), AvmMemoryTag::U16);

    EXPECT_EQ(alu_row.alu_u16_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic multiplication over u16 type.
TEST_F(AvmArithmeticTestsU16, multiplication)
{
    // trace_builder
    trace_builder.op_set(0, 200, 0, AvmMemoryTag::U16);
    trace_builder.op_set(0, 245, 1, AvmMemoryTag::U16);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U16);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_index = common_validate_mul(trace, FF(200), FF(245), FF(49000), FF(0), FF(1), FF(2), AvmMemoryTag::U16);
    auto alu_row = trace.at(alu_index);

    EXPECT_EQ(alu_row.alu_u16_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on multiplication over u16 type with overflow.
TEST_F(AvmArithmeticTestsU16, multiplicationOverflow)
{
    // trace_builder
    trace_builder.op_set(0, 512, 0, AvmMemoryTag::U16);
    trace_builder.op_set(0, 1024, 1, AvmMemoryTag::U16);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U16);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_index = common_validate_mul(trace, FF(512), FF(1024), FF(0), FF(0), FF(1), FF(2), AvmMemoryTag::U16);
    auto alu_row = trace.at(alu_index);

    EXPECT_EQ(alu_row.alu_u16_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test of equality on U16 elements
TEST_F(AvmArithmeticTestsU16, equality)
{
    auto trace = gen_trace_eq(35823, 35823, 0, 1, 2, AvmMemoryTag::U16);

    auto alu_row_index = common_validate_eq(trace, FF(35823), FF(35823), FF(1), FF(0), FF(1), FF(2), AvmMemoryTag::U16);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u16_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(0));
    validate_trace(std::move(trace), public_inputs);
}

// Test correct non-equality of U16 elements
TEST_F(AvmArithmeticTestsU16, nonEquality)
{
    auto trace = gen_trace_eq(35823, 50123, 0, 1, 2, AvmMemoryTag::U16);

    auto alu_row_index = common_validate_eq(trace, 35'823, 50'123, FF(0), FF(0), FF(1), FF(2), AvmMemoryTag::U16);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u16_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(-14'300).invert());
    validate_trace(std::move(trace), public_inputs);
}

/******************************************************************************
 * Positive Tests - U32
 ******************************************************************************/

// Test on basic addition over u32 type.
TEST_F(AvmArithmeticTestsU32, addition)
{
    // trace_builder
    trace_builder.op_set(0, 1000000000, 8, AvmMemoryTag::U32);
    trace_builder.op_set(0, 1234567891, 9, AvmMemoryTag::U32);

    trace_builder.op_add(0, 8, 9, 0, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(
        trace, FF(1000000000), FF(1234567891), FF(2234567891LLU), FF(8), FF(9), FF(0), AvmMemoryTag::U32);

    EXPECT_EQ(alu_row.alu_u32_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic addition over u32 type with carry.
TEST_F(AvmArithmeticTestsU32, additionCarry)
{
    // trace_builder
    trace_builder.op_set(0, UINT32_MAX - 1293, 8, AvmMemoryTag::U32);
    trace_builder.op_set(0, 2293, 9, AvmMemoryTag::U32);

    trace_builder.op_add(0, 8, 9, 0, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row =
        common_validate_add(trace, FF(UINT32_MAX - 1293), FF(2293), FF(999), FF(8), FF(9), FF(0), AvmMemoryTag::U32);

    EXPECT_EQ(alu_row.alu_u32_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic subtraction over u32 type.
TEST_F(AvmArithmeticTestsU32, subtraction)
{
    // trace_builder
    trace_builder.op_set(0, 1345678991, 8, AvmMemoryTag::U32);
    trace_builder.op_set(0, 1234567891, 9, AvmMemoryTag::U32);

    trace_builder.op_sub(0, 8, 9, 0, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_sub(
        trace, FF(1345678991), FF(1234567891), FF(111111100), FF(8), FF(9), FF(0), AvmMemoryTag::U32);

    EXPECT_EQ(alu_row.alu_u32_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic subtraction over u32 type with carry.
// For a subtraction a - b = c, there is a carry flag iff a < b (equivalent to a < c)
TEST_F(AvmArithmeticTestsU32, subtractionCarry)
{
    // trace_builder
    trace_builder.op_set(0, UINT32_MAX - 99, 8, AvmMemoryTag::U32);
    trace_builder.op_set(0, 3210987654, 9, AvmMemoryTag::U32);

    trace_builder.op_sub(0, 9, 8, 0, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_sub(
        trace, FF(3210987654LLU), FF(UINT32_MAX - 99), FF(3210987754LLU), FF(9), FF(8), FF(0), AvmMemoryTag::U32);

    EXPECT_EQ(alu_row.alu_u32_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic multiplication over u32 type.
TEST_F(AvmArithmeticTestsU32, multiplication)
{
    // trace_builder
    trace_builder.op_set(0, 11111, 0, AvmMemoryTag::U32);
    trace_builder.op_set(0, 11111, 1, AvmMemoryTag::U32);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row_index =
        common_validate_mul(trace, FF(11111), FF(11111), FF(123454321), FF(0), FF(1), FF(2), AvmMemoryTag::U32);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u32_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on multiplication over u32 type with overflow.
TEST_F(AvmArithmeticTestsU32, multiplicationOverflow)
{
    // trace_builder
    trace_builder.op_set(0, 11 << 25, 0, AvmMemoryTag::U32);
    trace_builder.op_set(0, 13 << 22, 1, AvmMemoryTag::U32);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row_index =
        common_validate_mul(trace, FF(11 << 25), FF(13 << 22), FF(0), FF(0), FF(1), FF(2), AvmMemoryTag::U32);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u32_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test of equality on U32 elements
TEST_F(AvmArithmeticTestsU32, equality)
{
    auto trace = gen_trace_eq(0xb435e9c1, 0xb435e9c1, 0, 1, 2, AvmMemoryTag::U32);

    auto alu_row_index =
        common_validate_eq(trace, 0xb435e9c1, 0xb435e9c1, FF(1), FF(0), FF(1), FF(2), AvmMemoryTag::U32);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u32_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test correct non-equality of U32 elements
TEST_F(AvmArithmeticTestsU32, nonEquality)
{
    auto trace = gen_trace_eq(0xb435e9c1, 0xb435e9c0, 0, 1, 2, AvmMemoryTag::U32);

    auto alu_row_index =
        common_validate_eq(trace, 0xb435e9c1, 0xb435e9c0, FF(0), FF(0), FF(1), FF(2), AvmMemoryTag::U32);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u32_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(1).invert());
    validate_trace(std::move(trace), public_inputs);
}

/******************************************************************************
 * Positive Tests - U64
 ******************************************************************************/

// Test on basic addition over u64 type.
TEST_F(AvmArithmeticTestsU64, addition)
{
    uint64_t const a = 7813981340746672LLU;
    uint64_t const b = 2379061066771309LLU;
    uint64_t const c = 10193042407517981LLU;

    // trace_builder
    trace_builder.op_set(0, a, 8, AvmMemoryTag::U64);
    trace_builder.op_set(0, b, 9, AvmMemoryTag::U64);

    trace_builder.op_add(0, 8, 9, 9, AvmMemoryTag::U64);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace, FF(a), FF(b), FF(c), FF(8), FF(9), FF(9), AvmMemoryTag::U64);

    EXPECT_EQ(alu_row.alu_u64_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic addition over u64 type with carry.
TEST_F(AvmArithmeticTestsU64, additionCarry)
{
    uint64_t const a = UINT64_MAX - 77LLU;
    uint64_t const b = UINT64_MAX - 123LLU;
    uint64_t const c = UINT64_MAX - 201LLU;

    // trace_builder
    trace_builder.op_set(0, a, 0, AvmMemoryTag::U64);
    trace_builder.op_set(0, b, 1, AvmMemoryTag::U64);

    trace_builder.op_add(0, 0, 1, 0, AvmMemoryTag::U64);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace, FF(a), FF(b), FF(c), FF(0), FF(1), FF(0), AvmMemoryTag::U64);

    EXPECT_EQ(alu_row.alu_u64_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic subtraction over u64 type.
TEST_F(AvmArithmeticTestsU64, subtraction)
{
    uint64_t const a = 9876543210123456789LLU;
    uint64_t const b = 9866543210123456789LLU;
    uint64_t const c = 10000000000000000LLU;

    // trace_builder
    trace_builder.op_set(0, a, 8, AvmMemoryTag::U64);
    trace_builder.op_set(0, b, 9, AvmMemoryTag::U64);

    trace_builder.op_sub(0, 8, 9, 9, AvmMemoryTag::U64);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_sub(trace, FF(a), FF(b), FF(c), FF(8), FF(9), FF(9), AvmMemoryTag::U64);

    EXPECT_EQ(alu_row.alu_u64_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic subtraction over u64 type with carry.
// For a subtraction a - b = c, there is a carry flag iff a < b (equivalent to a < c)
TEST_F(AvmArithmeticTestsU64, subtractionCarry)
{
    uint64_t const a = UINT64_MAX - 77LLU;
    uint64_t const b = UINT64_MAX - 2LLU;
    uint64_t const c = UINT64_MAX - 74;

    // trace_builder
    trace_builder.op_set(0, a, 0, AvmMemoryTag::U64);
    trace_builder.op_set(0, b, 1, AvmMemoryTag::U64);

    trace_builder.op_sub(0, 0, 1, 0, AvmMemoryTag::U64);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_sub(trace, FF(a), FF(b), FF(c), FF(0), FF(1), FF(0), AvmMemoryTag::U64);

    EXPECT_EQ(alu_row.alu_u64_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic multiplication over u64 type.
TEST_F(AvmArithmeticTestsU64, multiplication)
{
    // trace_builder
    trace_builder.op_set(0, 999888777, 0, AvmMemoryTag::U64);
    trace_builder.op_set(0, 555444333, 1, AvmMemoryTag::U64);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U64);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_mul(
        trace, FF(999888777), FF(555444333), FF(555382554814950741LLU), FF(0), FF(1), FF(2), AvmMemoryTag::U64);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u64_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on multiplication over u64 type with overflow.
TEST_F(AvmArithmeticTestsU64, multiplicationOverflow)
{
    uint64_t const a = UINT64_MAX;
    uint64_t const b = UINT64_MAX;
    // (2^64 - 1)^2 = 2^128 - 2^65 + 1 (mod. 2^64) = 1

    // trace_builder
    trace_builder.op_set(0, a, 0, AvmMemoryTag::U64);
    trace_builder.op_set(0, b, 1, AvmMemoryTag::U64);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U64);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_mul(trace, FF(a), FF(b), FF(1), FF(0), FF(1), FF(2), AvmMemoryTag::U64);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u64_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

TEST_F(AvmArithmeticTestsU64, equality)
{
    auto trace = gen_trace_eq(0xffffffffffffffe0LLU, 0xffffffffffffffe0LLU, 0, 1, 2, AvmMemoryTag::U64);

    auto alu_row_index = common_validate_eq(
        trace, 0xffffffffffffffe0LLU, 0xffffffffffffffe0LLU, FF(1), FF(0), FF(1), FF(2), AvmMemoryTag::U64);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u64_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(0));
    validate_trace(std::move(trace), public_inputs);
}

// Test correct non-equality of U64 elements
TEST_F(AvmArithmeticTestsU64, nonEquality)
{
    auto trace = gen_trace_eq(0xffffffffffffffe0LLU, 0xffffffffffaeffe0LLU, 0, 1, 2, AvmMemoryTag::U64);

    auto alu_row_index = common_validate_eq(
        trace, 0xffffffffffffffe0LLU, 0xffffffffffaeffe0LLU, FF(0), FF(0), FF(1), FF(2), AvmMemoryTag::U64);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u64_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(0x510000).invert());
    validate_trace(std::move(trace), public_inputs);
}

/******************************************************************************
 * Positive Tests - U128
 ******************************************************************************/

// Test on basic addition over u128 type.
TEST_F(AvmArithmeticTestsU128, addition)
{
    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    uint128_t const b = (uint128_t{ 0x3333222233331111LLU } << 64) + uint128_t{ 0x5555111155553333LLU };
    uint128_t const c = (uint128_t{ 0x8888444466665555LLU } << 64) + uint128_t{ 0xDDDDAAAAFFFFEEEELLU };

    // trace_builder
    trace_builder.op_set(0, a, 8, AvmMemoryTag::U128);
    trace_builder.op_set(0, b, 9, AvmMemoryTag::U128);

    trace_builder.op_add(0, 8, 9, 9, AvmMemoryTag::U128);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace,
                                       FF(uint256_t::from_uint128(a)),
                                       FF(uint256_t::from_uint128(b)),
                                       FF(uint256_t::from_uint128(c)),
                                       FF(8),
                                       FF(9),
                                       FF(9),
                                       AvmMemoryTag::U128);

    EXPECT_EQ(alu_row.alu_u128_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic addition over u128 type with carry.
TEST_F(AvmArithmeticTestsU128, additionCarry)
{
    uint128_t const a = (uint128_t{ UINT64_MAX } << 64) + uint128_t{ UINT64_MAX } - uint128_t{ 72948899 };
    uint128_t const b = (uint128_t{ UINT64_MAX } << 64) + uint128_t{ UINT64_MAX } - uint128_t{ 36177344 };
    uint128_t const c =
        (uint128_t{ UINT64_MAX } << 64) + uint128_t{ UINT64_MAX } - uint128_t{ 36177345 } - uint128_t{ 72948899 };

    // trace_builder
    trace_builder.op_set(0, a, 8, AvmMemoryTag::U128);
    trace_builder.op_set(0, b, 9, AvmMemoryTag::U128);

    trace_builder.op_add(0, 8, 9, 9, AvmMemoryTag::U128);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace,
                                       FF(uint256_t::from_uint128(a)),
                                       FF(uint256_t::from_uint128(b)),
                                       FF(uint256_t::from_uint128(c)),
                                       FF(8),
                                       FF(9),
                                       FF(9),
                                       AvmMemoryTag::U128);

    EXPECT_EQ(alu_row.alu_u128_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic subtraction over u128 type.
TEST_F(AvmArithmeticTestsU128, subtraction)
{
    uint128_t const a = (uint128_t{ UINT64_MAX } << 64) + uint128_t{ UINT64_MAX } - uint128_t{ 36177344 };
    uint128_t const b = (uint128_t{ UINT64_MAX } << 64) + uint128_t{ UINT64_MAX } - uint128_t{ 72948899 };
    uint128_t const c = 36771555; // 72948899 - 36177344

    // trace_builder
    trace_builder.op_set(0, a, 8, AvmMemoryTag::U128);
    trace_builder.op_set(0, b, 9, AvmMemoryTag::U128);

    trace_builder.op_sub(0, 8, 9, 9, AvmMemoryTag::U128);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_sub(trace,
                                       FF(uint256_t::from_uint128(a)),
                                       FF(uint256_t::from_uint128(b)),
                                       FF(uint256_t::from_uint128(c)),
                                       FF(8),
                                       FF(9),
                                       FF(9),
                                       AvmMemoryTag::U128);

    EXPECT_EQ(alu_row.alu_u128_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic subtraction over u128 type with carry.
TEST_F(AvmArithmeticTestsU128, subtractionCarry)
{
    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    uint128_t const b = (uint128_t{ 0x3333222233331111LLU } << 64) + uint128_t{ 0x5555111155553333LLU };
    uint128_t const c = (uint128_t{ 0x2222000000003333LLU } << 64) + uint128_t{ 0x3333888855558888LLU };

    // trace_builder
    trace_builder.op_set(0, a, 8, AvmMemoryTag::U128);
    trace_builder.op_set(0, b, 9, AvmMemoryTag::U128);

    trace_builder.op_sub(0, 8, 9, 9, AvmMemoryTag::U128);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_sub(trace,
                                       FF(uint256_t::from_uint128(a)),
                                       FF(uint256_t::from_uint128(b)),
                                       FF(uint256_t::from_uint128(c)),
                                       FF(8),
                                       FF(9),
                                       FF(9),
                                       AvmMemoryTag::U128);

    EXPECT_EQ(alu_row.alu_u128_tag, FF(1));
    EXPECT_EQ(alu_row.alu_cf, FF(0));

    validate_trace(std::move(trace), public_inputs);
}

// Test on basic multiplication over u128 type.
TEST_F(AvmArithmeticTestsU128, multiplication)
{
    // trace_builder
    trace_builder.op_set(0, 0x38D64BF685FFBLLU, 0, AvmMemoryTag::U128);
    trace_builder.op_set(0, 0x1F92C762C98DFLLU, 1, AvmMemoryTag::U128);
    // Integer multiplication output in HEX: 70289AEB0A7DDA0BAE60CA3A5
    FF c{ uint256_t{ 0xA7DDA0BAE60CA3A5, 0x70289AEB0, 0, 0 } };

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U128);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_mul(
        trace, FF(0x38D64BF685FFBLLU), FF(555444333222111LLU), c, FF(0), FF(1), FF(2), AvmMemoryTag::U128);
    auto alu_row_first = trace.at(alu_row_index);

    EXPECT_EQ(alu_row_first.alu_u128_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

// Test on multiplication over u128 type with overflow.
TEST_F(AvmArithmeticTestsU128, multiplicationOverflow)
{
    // (2^128 - 2) * (2^128 - 4) = 2^256 - 2^130 - 2^129 + 2^3
    // The above modulo 2^128 = 8
    uint128_t const a = (uint128_t{ UINT64_MAX } << 64) + uint128_t{ UINT64_MAX - 1 };
    uint128_t const b = (uint128_t{ UINT64_MAX } << 64) + uint128_t{ UINT64_MAX - 3 };

    // trace_builder
    trace_builder.op_set(0, a, 0, AvmMemoryTag::U128);
    trace_builder.op_set(0, b, 1, AvmMemoryTag::U128);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U128);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_mul(trace,
                                             FF{ uint256_t::from_uint128(a) },
                                             FF{ uint256_t::from_uint128(b) },
                                             FF{ 8 },
                                             FF(0),
                                             FF(1),
                                             FF(2),
                                             AvmMemoryTag::U128);
    auto alu_row_first = trace.at(alu_row_index);

    EXPECT_EQ(alu_row_first.alu_u128_tag, FF(1));

    validate_trace(std::move(trace), public_inputs);
}

TEST_F(AvmArithmeticTestsU128, equality)
{
    uint128_t const elem = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    auto trace = gen_trace_eq(elem, elem, 0, 1, 2, AvmMemoryTag::U128);

    auto alu_row_index = common_validate_eq(trace,
                                            FF(uint256_t::from_uint128(elem)),
                                            FF(uint256_t::from_uint128(elem)),
                                            FF(1),
                                            FF(0),
                                            FF(1),
                                            FF(2),
                                            AvmMemoryTag::U128);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u128_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(0));
    validate_trace(std::move(trace), public_inputs);
}

// Test correct non-equality of U128 elements
TEST_F(AvmArithmeticTestsU128, nonEquality)
{
    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    uint128_t const b = a - (0xdeadbeefLLU << 32);
    auto trace = gen_trace_eq(a, b, 0, 1, 2, AvmMemoryTag::U128);

    auto alu_row_index = common_validate_eq(trace,
                                            FF(uint256_t::from_uint128(a)),
                                            FF(uint256_t::from_uint128(b)),
                                            FF(0),
                                            FF(0),
                                            FF(1),
                                            FF(2),
                                            AvmMemoryTag::U128);
    auto alu_row = trace.at(alu_row_index);

    EXPECT_EQ(alu_row.alu_u128_tag, FF(1));
    EXPECT_EQ(alu_row.cmp_op_eq_diff_inv, FF(0xdeadbeefLLU << 32).invert());
    validate_trace(std::move(trace), public_inputs);
}

/******************************************************************************
 *
 * NEGATIVE TESTS - Finite Field Type
 *
 ******************************************************************************
 * The negative tests are the counterparts of the positive tests for which we want
 * to test that a deviation of the prescribed behaviour of the VM will lead to
 * an exception being raised while attempting to generate a proof.
 *
 * As for the positive tests, we isolate each operation addition, subtraction, multiplication
 * and division by having dedicated unit test for each of them.
 * A typical pattern is to wrongly mutate the result of the operation. The memory trace
 * is consistently adapted so that the negative test is applying to the relation
 * of the arithmetic operation and not the layout of the memory trace.
 *
 * Finding the row pertaining to the arithmetic operation is done through
 * a scan of all rows and stopping at the first one with the corresponding
 * operator selector. This mechanism is used with the hope that these unit tests
 * will still correctly work along the development of the AVM.
 ******************************************************************************/

/******************************************************************************
 * Negative Tests - FF
 ******************************************************************************/

// Test on basic incorrect addition over finite field type.
TEST_F(AvmArithmeticNegativeTestsFF, addition)
{

    auto trace = gen_mutated_trace_add(FF(37), FF(4), FF(40), AvmMemoryTag::FF);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_1");
}

// Test on basic incorrect subtraction over finite field type.
TEST_F(AvmArithmeticNegativeTestsFF, subtraction)
{

    auto trace = gen_mutated_trace_sub(FF(17), FF(8), FF(-9), AvmMemoryTag::FF);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_1");
}

// Test on basic incorrect multiplication over finite field type.
TEST_F(AvmArithmeticNegativeTestsFF, multiplication)
{

    auto trace = gen_mutated_trace_mul(FF(9), FF(100), FF(9000000), AvmMemoryTag::FF);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_MULTIPLICATION_FF");
}

// Test on basic incorrect division over finite field type.
TEST_F(AvmArithmeticNegativeTestsFF, fDivision)
{

    std::vector<FF> const calldata = { 15, 315 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 2, 0);

    //                  Memory layout:    [15,315,0,0,0,0,....]
    trace_builder.op_fdiv(0, 1, 0, 2); // [15,315,21,0,0,0....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto select_row = [](Row r) { return r.main_sel_op_fdiv == FF(1); };
    mutate_ic_in_trace(trace, std::move(select_row), FF(0));

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "SUBOP_FDIV");
}

// Test where division is not by zero but an operation error is wrongly raised
// in the trace.
TEST_F(AvmArithmeticNegativeTestsFF, fDivisionNoZeroButError)
{

    std::vector<FF> const calldata = { 15, 315 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 2, 0);

    //                  Memory layout:    [15,315,0,0,0,0,....]
    trace_builder.op_fdiv(0, 1, 0, 2); // [15,315,21,0,0,0....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the fdiv selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == FF(1); });

    size_t const index = static_cast<size_t>(row - trace.begin());

    // Activate the operator error
    trace[index].main_op_err = FF(1);
    auto trace2 = trace;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "SUBOP_FDIV_ZERO_ERR1");

    // Even more malicious, one makes the first relation passes by setting the inverse to zero.
    trace2[index].main_inv = FF(0);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace2)), "SUBOP_FDIV_ZERO_ERR2");
}

// Test with finite field division by zero occurs and no error is raised (remove error flag)
TEST_F(AvmArithmeticNegativeTestsFF, fDivisionByZeroNoError)
{

    std::vector<FF> const calldata = { 15 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 1, 0);

    //                  Memory layout:    [15,0,0,0,0,0,....]
    trace_builder.op_fdiv(0, 0, 1, 2); // [15,0,0,0,0,0....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the fdiv selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == FF(1); });

    // Remove the operator error flag
    row->main_op_err = FF(0);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "SUBOP_FDIV");
}

// Test with finite field division of zero by zero occurs and no error is raised (remove error flag)
TEST_F(AvmArithmeticNegativeTestsFF, fDivisionZeroByZeroNoError)
{

    //                  Memory layout:    [0,0,0,0,0,0,....]
    trace_builder.op_fdiv(0, 0, 1, 2); // [0,0,0,0,0,0....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the fdiv selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == FF(1); });

    // Remove the operator error flag
    row->main_op_err = FF(0);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "SUBOP_FDIV_ZERO_ERR1");
}

// Test with finite field division using a wrong read instruction tag
TEST_F(AvmArithmeticNegativeTestsFF, fDivisionWrongRInTag)
{

    std::vector<FF> const calldata = { 18, 6 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 1, 0);
    //                  Memory layout:    [18,6,0,0,0,0,....]
    trace_builder.op_fdiv(0, 0, 1, 2); // [18,6,3,0,0,0....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the fdiv selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == FF(1); });

    // Change read instruction tag
    row->main_r_in_tag = FF(3);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "SUBOP_FDIV_R_IN_TAG_FF");
}

// Test with finite field division using a wrong write instruction tag
TEST_F(AvmArithmeticNegativeTestsFF, fDivisionWrongWInTag)
{

    std::vector<FF> const calldata = { 18, 6 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 1, 0);
    //                  Memory layout:    [18,6,0,0,0,0,....]
    trace_builder.op_fdiv(0, 0, 1, 2); // [18,6,3,0,0,0....]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the fdiv selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == FF(1); });

    // Change write instruction tag
    row->main_w_in_tag = FF(3);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "SUBOP_FDIV_W_IN_TAG_FF");
}

// Test that error flag cannot be raised for a non-relevant operation such as
// the addition, subtraction, multiplication.
TEST_F(AvmArithmeticNegativeTestsFF, operationWithErrorFlag1)
{

    std::vector<FF> const calldata = { 37, 4, 11 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 3, 0);

    //                             Memory layout:    [37,4,11,0,0,0,....]
    trace_builder.op_add(0, 0, 1, 4, AvmMemoryTag::FF); // [37,4,11,0,41,0,....]
    trace_builder.op_return(0, 0, 5);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the addition selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_add == FF(1); });

    // Activate the operator error
    row->main_op_err = FF(1);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "SUBOP_ERROR_RELEVANT_OP");
}

TEST_F(AvmArithmeticNegativeTestsFF, operationWithErrorFlag2)
{

    std::vector<FF> const calldata = { 8, 4, 17 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 3, 0);

    //                             Memory layout:    [8,4,17,0,0,0,....]
    trace_builder.op_sub(0, 2, 0, 1, AvmMemoryTag::FF); // [8,9,17,0,0,0....]
    trace_builder.op_return(0, 0, 3);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the subtraction selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sub == FF(1); });

    // Activate the operator error
    row->main_op_err = FF(1);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "SUBOP_ERROR_RELEVANT_OP");
}

TEST_F(AvmArithmeticNegativeTestsFF, operationWithErrorFlag3)
{

    std::vector<FF> const calldata = { 5, 0, 20 };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 3, 0);

    //                             Memory layout:    [5,0,20,0,0,0,....]
    trace_builder.op_mul(0, 2, 0, 1, AvmMemoryTag::FF); // [5,100,20,0,0,0....]
    trace_builder.op_return(0, 0, 3);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the multiplication selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_mul == FF(1); });

    // Activate the operator error
    row->main_op_err = FF(1);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "SUBOP_ERROR_RELEVANT_OP");
}

// Tests a situation for field elements where a != b but c == 1;
TEST_F(AvmArithmeticNegativeTestsFF, invalidEquality)
{

    std::vector<Row> trace = gen_mutated_trace_eq(FF::modulus_minus_two, FF(0), FF(1), FF(0), AvmMemoryTag::FF);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for field elements where a == b but c == 0;
TEST_F(AvmArithmeticNegativeTestsFF, invalidInequality)
{

    std::vector<Row> trace =
        gen_mutated_trace_eq(FF::modulus_minus_two, FF::modulus_minus_two, FF(0), FF(0), AvmMemoryTag::FF);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for field elements where c is non-boolean, i,e, c!= {0,1};
TEST_F(AvmArithmeticNegativeTestsFF, nonBooleanEq)
{

    std::vector<Row> trace =
        gen_mutated_trace_eq(FF::modulus_minus_two, FF::modulus_minus_two, FF(10), FF(0), AvmMemoryTag::FF);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_RES_IS_BOOL");
}

// Tests a situation for field elements where the tag for c is not U8.
TEST_F(AvmArithmeticNegativeTestsFF, eqOutputWrongTag)
{

    FF elem = FF::modulus - FF(15);
    std::vector<FF> const calldata = { elem, elem };
    gen_trace_builder(calldata);
    trace_builder.op_calldata_copy(0, 0, 2, 0);
    trace_builder.op_eq(0, 0, 1, 2, AvmMemoryTag::FF); // Memory Layout [elem, elem, 1, 0..]
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the eq selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_eq == FF(1); });
    ASSERT_TRUE(row != trace.end());

    row->main_w_in_tag = FF(4);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "OUTPUT_U8");
}

// Tests a situation for field elements the (a-b)^1 is incorrect. i.e. (a-b) * (a-b)^1 != 1 for (a-b) != 0;
TEST_F(AvmArithmeticNegativeTestsFF, invalidInverseDifference)
{

    // The a, b and c registers contain the correct information, only the inversion of differences is wrong.
    std::vector<Row> trace =
        gen_mutated_trace_eq(FF::modulus_minus_two, FF(0), FF(0), FF(5).invert(), AvmMemoryTag::FF);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

/******************************************************************************
 * Negative Tests - U8
 ******************************************************************************/

// Test on basic incorrect addition over U8.
TEST_F(AvmArithmeticNegativeTestsU8, addition)
{

    auto trace = gen_mutated_trace_add(FF(234), FF(22), FF(1), AvmMemoryTag::U8);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect subtraction over U8.
TEST_F(AvmArithmeticNegativeTestsU8, subtraction)
{

    auto trace = gen_mutated_trace_sub(FF(100), FF(104), FF(253), AvmMemoryTag::U8);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect multiplication over U8.
TEST_F(AvmArithmeticNegativeTestsU8, multiplication)
{

    auto trace = gen_mutated_trace_mul(FF(9), FF(100), FF(55), AvmMemoryTag::U8);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_MUL_COMMON_2");
}

// Tests a situation for U8 elements where a != b but c == 1;
TEST_F(AvmArithmeticNegativeTestsU8, invalidEquality)
{

    std::vector<Row> trace = gen_mutated_trace_eq(FF(10), FF(255), FF(1), FF(0), AvmMemoryTag::U8);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U8 elements where a == b but c == 0;
TEST_F(AvmArithmeticNegativeTestsU8, invalidInequality)
{

    std::vector<Row> trace = gen_mutated_trace_eq(FF(128), FF(128), FF(0), FF(0), AvmMemoryTag::U8);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U8 elements where c is non-boolean, i,e, c!= {0,1};
TEST_F(AvmArithmeticNegativeTestsU8, nonBooleanEq)
{

    std::vector<Row> trace = gen_mutated_trace_eq(FF(128), FF(128), FF(200), FF(0), AvmMemoryTag::U8);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_RES_IS_BOOL");
}

// Tests a situation for U8 elements where the tag for c is not U8.
TEST_F(AvmArithmeticNegativeTestsU8, eqOutputWrongTag)
{

    auto trace = gen_trace_eq(2, 3, 23, 24, 25, AvmMemoryTag::U8);

    // Find the first row enabling the eq selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_eq == FF(1); });
    ASSERT_TRUE(row != trace.end());

    row->main_w_in_tag = FF(3);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "OUTPUT_U8");
}

// Tests a situation for U8 elements the (a-b)^1 is incorrect. i.e. (a-b) * (a-b)^1 != 1 for (a-b) != 0;
TEST_F(AvmArithmeticNegativeTestsU8, invalidInverseDifference)
{

    // The a, b and c registers contain the correct information, only the inversion of differences is wrong.
    std::vector<Row> trace = gen_mutated_trace_eq(FF(130), FF(0), FF(0), FF(1000).invert(), AvmMemoryTag::U8);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

/******************************************************************************
 * Negative Tests - U16
 ******************************************************************************/

// Test on basic incorrect addition over U16.
TEST_F(AvmArithmeticNegativeTestsU16, addition)
{

    auto trace = gen_mutated_trace_add(FF(8234), FF(7428), FF(653), AvmMemoryTag::U16);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect subtraction over U16.
TEST_F(AvmArithmeticNegativeTestsU16, subtraction)
{

    auto trace = gen_mutated_trace_sub(FF(100), FF(932), FF(25373), AvmMemoryTag::U16);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect multiplication over U16.
TEST_F(AvmArithmeticNegativeTestsU16, multiplication)
{

    auto trace = gen_mutated_trace_mul(FF(8096), FF(1024), FF(1), AvmMemoryTag::U16);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_MUL_COMMON_2");
}

// Tests a situation for U16 elements where a != b but c == 1;
TEST_F(AvmArithmeticNegativeTestsU16, invalidEquality)
{

    std::vector<Row> trace = gen_mutated_trace_eq(FF(10), FF(255), FF(1), FF(0), AvmMemoryTag::U16);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U16 elements where a == b but c == 0;
TEST_F(AvmArithmeticNegativeTestsU16, invalidInequality)
{

    std::vector<Row> trace = gen_mutated_trace_eq(FF(128), FF(128), FF(0), FF(0), AvmMemoryTag::U16);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U16 elements where c is non-boolean, i,e, c!= {0,1};
TEST_F(AvmArithmeticNegativeTestsU16, nonBooleanEq)
{

    std::vector<Row> trace = gen_mutated_trace_eq(FF(128), FF(128), FF(200), FF(0), AvmMemoryTag::U16);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_RES_IS_BOOL");
}

// Tests a situation for U16 elements where the tag for c is not U8.
TEST_F(AvmArithmeticNegativeTestsU16, eqOutputWrongTag)
{

    auto trace = gen_trace_eq(1515, 1515, 23, 24, 25, AvmMemoryTag::U16);

    // Find the first row enabling the eq selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_eq == FF(1); });
    ASSERT_TRUE(row != trace.end());

    row->main_w_in_tag = FF(5);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "OUTPUT_U8");
}

// Tests a situation for U16 elements the (a-b)^1 is incorrect. i.e. (a-b) * (a-b)^1 != 1 for (a-b) != 0;
TEST_F(AvmArithmeticNegativeTestsU16, invalidInverseDifference)
{

    // The a, b and c registers contain the correct information, only the inversion of differences is wrong.
    std::vector<Row> trace = gen_mutated_trace_eq(FF(130), FF(0), FF(0), FF(1000).invert(), AvmMemoryTag::U16);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}
/******************************************************************************
 * Negative Tests - U32
 ******************************************************************************/

// Test on basic incorrect addition over U32.
TEST_F(AvmArithmeticNegativeTestsU32, addition)
{

    auto trace = gen_mutated_trace_add(FF(1972382341), FF(1111133221), FF(1222222222), AvmMemoryTag::U32);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect subtraction over U32.
TEST_F(AvmArithmeticNegativeTestsU32, subtraction)
{

    auto trace = gen_mutated_trace_sub(FF(3999888777LLU), FF(UINT32_MAX), FF(2537332433LLU), AvmMemoryTag::U32);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect multiplication over U32.
TEST_F(AvmArithmeticNegativeTestsU32, multiplication)
{

    auto trace = gen_mutated_trace_mul(FF(UINT32_MAX), FF(UINT32_MAX), FF(0), AvmMemoryTag::U32);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_MUL_COMMON_2");
}

// Tests a situation for U32 elements where a != b but c == 1;
TEST_F(AvmArithmeticNegativeTestsU32, invalidEquality)
{

    std::vector<Row> trace = gen_mutated_trace_eq(FF(UINT32_MAX - 10), FF(UINT32_MAX), FF(1), FF(0), AvmMemoryTag::U32);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U32 elements where a == b but c == 0;
TEST_F(AvmArithmeticNegativeTestsU32, invalidInequality)
{

    std::vector<Row> trace = gen_mutated_trace_eq(FF(73934721LLU), FF(73934721LLU), FF(0), FF(0), AvmMemoryTag::U32);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U32 elements where c is non-boolean, i,e, c!= {0,1};
TEST_F(AvmArithmeticNegativeTestsU32, nonBooleanEq)
{

    std::vector<Row> trace =
        gen_mutated_trace_eq(FF(623138LLU), FF(623138LLU), FF(8728342LLU), FF(0), AvmMemoryTag::U32);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_RES_IS_BOOL");
}

// Tests a situation for U32 elements where the tag for c is not U8.
TEST_F(AvmArithmeticNegativeTestsU32, eqOutputWrongTag)
{

    auto trace = gen_trace_eq(15, 15, 23, 24, 25, AvmMemoryTag::U32);

    // Find the first row enabling the eq selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_eq == FF(1); });
    ASSERT_TRUE(row != trace.end());

    row->main_w_in_tag = FF(6);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "OUTPUT_U8");
}

// Tests a situation for U32 elements the (a-b)^1 is incorrect. i.e. (a-b) * (a-b)^1 != 1 for (a-b) != 0;
TEST_F(AvmArithmeticNegativeTestsU32, invalidInverseDifference)
{

    // The a, b and c registers contain the correct information, only the inversion of differences is wrong.
    std::vector<Row> trace =
        gen_mutated_trace_eq(FF(74329231LLU), FF(74329231LLU), FF(0), FF(7432701LLU).invert(), AvmMemoryTag::U32);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

/******************************************************************************
 * Negative Tests - U64
 ******************************************************************************/

// Test on basic incorrect addition over U64.
TEST_F(AvmArithmeticNegativeTestsU64, addition)
{

    auto trace = gen_mutated_trace_add(
        FF(3324236423198282341LLU), FF(999999991111133221LLU), FF(1222222222236LLU), AvmMemoryTag::U64);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect subtraction over U64.
TEST_F(AvmArithmeticNegativeTestsU64, subtraction)
{

    auto trace =
        gen_mutated_trace_sub(FF(399988877723434LLU), FF(UINT64_MAX), FF(25373324332342LLU), AvmMemoryTag::U64);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect multiplication over U64.
TEST_F(AvmArithmeticNegativeTestsU64, multiplication)
{

    auto trace =
        gen_mutated_trace_mul(FF(399988877723434LLU), FF(9998887772343LLU), FF(9283674827534LLU), AvmMemoryTag::U64);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_MUL_COMMON_2");
}

// Tests a situation for U64 elements where a != b but c == 1;
TEST_F(AvmArithmeticNegativeTestsU64, invalidEquality)
{

    std::vector<Row> trace =
        gen_mutated_trace_eq(FF(3999888777231234LLU), FF(3999882177231234LLU), FF(1), FF(0), AvmMemoryTag::U64);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U64 elements where a == b but c == 0;
TEST_F(AvmArithmeticNegativeTestsU64, invalidInequality)
{

    std::vector<Row> trace =
        gen_mutated_trace_eq(FF(9998887772343LLU), FF(73934721LLU), FF(0), FF(0), AvmMemoryTag::U64);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U64 elements where c is non-boolean, i,e, c!= {0,1};
TEST_F(AvmArithmeticNegativeTestsU64, nonBooleanEq)
{

    std::vector<Row> trace =
        gen_mutated_trace_eq(FF(9998887772343LLU), FF(9998887772343LLU), FF(2), FF(0), AvmMemoryTag::U64);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_RES_IS_BOOL");
}

// Tests a situation for U64 elements where the tag for c is not U8.
TEST_F(AvmArithmeticNegativeTestsU64, eqOutputWrongTag)
{

    auto trace = gen_trace_eq(198732, 15, 23, 24, 25, AvmMemoryTag::U64);

    // Find the first row enabling the eq selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_eq == FF(1); });
    ASSERT_TRUE(row != trace.end());

    row->main_w_in_tag = FF(2);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "OUTPUT_U8");
}

// Tests a situation for U64 elements the (a-b)^1 is incorrect. i.e. (a-b) * (a-b)^1 != 1 for (a-b) != 0;
TEST_F(AvmArithmeticNegativeTestsU64, invalidInverseDifference)
{

    // The a, b and c registers contain the correct information, only the inversion of differences is wrong.
    std::vector<Row> trace = gen_mutated_trace_eq(
        FF(9998887772343LLU), FF(9998887772343LLU), FF(0), FF(0x373428).invert(), AvmMemoryTag::U64);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

/******************************************************************************
 * Negative Tests - U128
 ******************************************************************************/

// Test on basic incorrect addition over U128.
TEST_F(AvmArithmeticNegativeTestsU128, addition)
{

    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    uint128_t const b = (uint128_t{ 0x3333222233331111LLU } << 64) + uint128_t{ 0x5555111155553333LLU };
    uint128_t const c = (uint128_t{ 0x8888444466665555LLU } << 64) + uint128_t{ 0xDDDDAAAAFFFFEEEFLLU };

    auto trace = gen_mutated_trace_add(FF{ uint256_t::from_uint128(a) },
                                       FF{ uint256_t::from_uint128(b) },
                                       FF{ uint256_t::from_uint128(c) },
                                       AvmMemoryTag::U128);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect subtraction over U128.
TEST_F(AvmArithmeticNegativeTestsU128, subtraction)
{

    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    uint128_t const b = (uint128_t{ 0x7333222233331111LLU } << 64) + uint128_t{ 0x5555111155553333LLU };
    uint128_t const c = (uint128_t{ 0x8888444466665555LLU } << 64) + uint128_t{ 0xDDDDALLU };

    auto trace = gen_mutated_trace_sub(FF{ uint256_t::from_uint128(a) },
                                       FF{ uint256_t::from_uint128(b) },
                                       FF{ uint256_t::from_uint128(c) },
                                       AvmMemoryTag::U128);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_ADD_SUB_2");
}

// Test on basic incorrect multiplication over U128.
TEST_F(AvmArithmeticNegativeTestsU128, multiplication)
{

    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    uint128_t const b = (uint128_t{ 0x7333222233331111LLU } << 64) + uint128_t{ 0x5555111155553333LLU };
    uint128_t const c = (uint128_t{ 0x8888444466665555LLU } << 64) + uint128_t{ 0xDDDDALLU };

    auto trace = gen_mutated_trace_mul(FF{ uint256_t::from_uint128(a) },
                                       FF{ uint256_t::from_uint128(b) },
                                       FF{ uint256_t::from_uint128(c) },
                                       AvmMemoryTag::U128);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_MULTIPLICATION_OUT_U128");
}

// Test that the second row of an U128 multiplication cannot be enabled for
// another alu operation.
TEST_F(AvmArithmeticNegativeTestsU128, multiplicationSecondRowNoOp)
{

    trace_builder.op_set(0, 3, 0, AvmMemoryTag::U128);
    trace_builder.op_set(0, 4, 1, AvmMemoryTag::U128);

    trace_builder.op_mul(0, 0, 1, 2, AvmMemoryTag::U128);
    trace_builder.op_return(0, 0, 0);
    auto trace = trace_builder.finalize();

    auto alu_row_index = common_validate_mul(trace, FF(3), FF(4), FF(12), FF(0), FF(1), FF(2), AvmMemoryTag::U128);

    // We have to enable alu_sel otherwise another relation will fail.
    trace.at(alu_row_index + 1).alu_sel_alu = 1;

    // Add an LTE selector in the next row (second part of U128 multiplication)
    auto trace_lte = trace;
    trace_lte.at(alu_row_index + 1).alu_op_lte = 1;
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace_lte)), "TWO_LINE_OP_NO_OVERLAP");

    // Try with SUB selector.
    auto trace_sub = trace;
    trace_sub.at(alu_row_index + 1).alu_op_sub = 1;
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace_sub)), "TWO_LINE_OP_NO_OVERLAP");

    // Try with another MUL selector.
    trace.at(alu_row_index + 1).alu_op_mul = 1;
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "TWO_LINE_OP_NO_OVERLAP");
}

// Tests a situation for U128 elements where a != b but c == 1;
TEST_F(AvmArithmeticNegativeTestsU128, invalidEquality)
{

    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    FF const ff_a = FF{ uint256_t::from_uint128(a) };
    uint128_t const b = (uint128_t{ 0x5555222313334444LLU } << 64) + uint128_t{ 0x88889998AAABBBBLLU };
    FF const ff_b = FF{ uint256_t::from_uint128(b) };

    std::vector<Row> trace = gen_mutated_trace_eq(ff_a, ff_b, FF(1), FF(0), AvmMemoryTag::U128);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U128 elements where a == b but c == 0;
TEST_F(AvmArithmeticNegativeTestsU128, invalidInequality)
{

    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    FF const ff_a = FF{ uint256_t::from_uint128(a) };

    std::vector<Row> trace = gen_mutated_trace_eq(ff_a, ff_a, FF(0), FF(0), AvmMemoryTag::U128);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

// Tests a situation for U128 elements where c is non-boolean, i,e, c!= {0,1};
TEST_F(AvmArithmeticNegativeTestsU128, nonBooleanEq)
{

    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    FF const ff_a = FF{ uint256_t::from_uint128(a) };
    std::vector<Row> trace = gen_mutated_trace_eq(ff_a, ff_a, FF::modulus - FF(1), FF(0), AvmMemoryTag::U128);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_RES_IS_BOOL");
}

// Tests a situation for U128 elements where the tag for c is not U8.
TEST_F(AvmArithmeticNegativeTestsU128, eqOutputWrongTag)
{

    auto trace = gen_trace_eq(1587, 1587, 23, 24, 25, AvmMemoryTag::U128);

    // Find the first row enabling the eq selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_eq == FF(1); });
    ASSERT_TRUE(row != trace.end());

    row->main_w_in_tag = FF(4);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "OUTPUT_U8");
}

// Tests a situation for U128 elements the (a-b)^1 is incorrect. i.e. (a-b) * (a-b)^1 != 1 for (a-b) != 0;
TEST_F(AvmArithmeticNegativeTestsU128, invalidInverseDifference)
{

    uint128_t const a = (uint128_t{ 0x5555222233334444LLU } << 64) + uint128_t{ 0x88889999AAAABBBBLLU };
    FF const ff_a = FF{ uint256_t::from_uint128(a) };
    // The a, b and c registers contain the correct information, only the inversion of differences is wrong.
    std::vector<Row> trace = gen_mutated_trace_eq(ff_a, ff_a, FF(0), FF(0x8efaddd292LLU).invert(), AvmMemoryTag::U128);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "ALU_OP_EQ");
}

} // namespace tests_avm
