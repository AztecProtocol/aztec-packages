#include "AvmMini_common.test.hpp"

namespace {

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
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_add == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->avmMini_ic, c);
    EXPECT_EQ(row->avmMini_mem_idx_c, addr_c);
    EXPECT_EQ(row->avmMini_mem_op_c, FF(1));
    EXPECT_EQ(row->avmMini_rwc, FF(1));

    // Check that ia and ib registers are correctly set with memory load operations.
    EXPECT_EQ(row->avmMini_ia, a);
    EXPECT_EQ(row->avmMini_mem_idx_a, addr_a);
    EXPECT_EQ(row->avmMini_mem_op_a, FF(1));
    EXPECT_EQ(row->avmMini_rwa, FF(0));
    EXPECT_EQ(row->avmMini_ib, b);
    EXPECT_EQ(row->avmMini_mem_idx_b, addr_b);
    EXPECT_EQ(row->avmMini_mem_op_b, FF(1));
    EXPECT_EQ(row->avmMini_rwb, FF(0));

    // Check instruction tag and add selector are set.
    EXPECT_EQ(row->avmMini_in_tag, FF(static_cast<uint32_t>(tag)));
    EXPECT_EQ(row->avmMini_sel_op_add, FF(1));

    // Check that Alu trace is as expected.
    auto clk = row->avmMini_clk;
    auto alu_row = std::ranges::find_if(trace.begin(), trace.end(), [clk](Row r) { return r.aluChip_alu_clk == clk; });

    EXPECT_TRUE(alu_row != trace.end());
    EXPECT_EQ(alu_row->aluChip_alu_op_add, FF(1));
    EXPECT_EQ(alu_row->aluChip_alu_ia, a);
    EXPECT_EQ(alu_row->aluChip_alu_ib, b);
    EXPECT_EQ(alu_row->aluChip_alu_ic, c);

    return *alu_row;
}

} // anonymous namespace

namespace tests_avm {
using namespace avm_trace;

class AvmMiniArithmeticTests : public ::testing::Test {
  public:
    AvmMiniTraceBuilder trace_builder;

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override
    {
        barretenberg::srs::init_crs_factory("../srs_db/ignition");
        trace_builder = AvmMiniTraceBuilder(); // Clean instance for every run.
    };
};

class AvmMiniArithmeticTestsFF : public AvmMiniArithmeticTests {};
class AvmMiniArithmeticTestsU8 : public AvmMiniArithmeticTests {};
class AvmMiniArithmeticNegativeTestsFF : public AvmMiniArithmeticTests {};

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
TEST_F(AvmMiniArithmeticTestsFF, addition)
{
    // trace_builder
    trace_builder.call_data_copy(0, 3, 0, std::vector<FF>{ 37, 4, 11 });

    //                             Memory layout:    [37,4,11,0,0,0,....]
    trace_builder.add(0, 1, 4, AvmMemoryTag::ff); // [37,4,11,0,41,0,....]
    trace_builder.return_op(0, 5);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace, FF(37), FF(4), FF(41), FF(0), FF(1), FF(4), AvmMemoryTag::ff);

    EXPECT_EQ(alu_row.aluChip_alu_ff_tag, FF(1));

    validate_trace_proof(std::move(trace));
}

// Test on basic subtraction over finite field type.
TEST_F(AvmMiniArithmeticTestsFF, subtraction)
{
    trace_builder.call_data_copy(0, 3, 0, std::vector<FF>{ 8, 4, 17 });

    //                             Memory layout:    [8,4,17,0,0,0,....]
    trace_builder.sub(2, 0, 1, AvmMemoryTag::ff); // [8,9,17,0,0,0....]
    trace_builder.return_op(0, 3);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the subtraction selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_sub == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->avmMini_ic, FF(9));
    EXPECT_EQ(row->avmMini_mem_idx_c, FF(1));
    EXPECT_EQ(row->avmMini_mem_op_c, FF(1));
    EXPECT_EQ(row->avmMini_rwc, FF(1));

    validate_trace_proof(std::move(trace));
}

// Test on basic multiplication over finite field type.
TEST_F(AvmMiniArithmeticTestsFF, multiplication)
{
    trace_builder.call_data_copy(0, 3, 0, std::vector<FF>{ 5, 0, 20 });

    //                             Memory layout:    [5,0,20,0,0,0,....]
    trace_builder.mul(2, 0, 1, AvmMemoryTag::ff); // [5,100,20,0,0,0....]
    trace_builder.return_op(0, 3);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the multiplication selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_mul == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->avmMini_ic, FF(100));
    EXPECT_EQ(row->avmMini_mem_idx_c, FF(1));
    EXPECT_EQ(row->avmMini_mem_op_c, FF(1));
    EXPECT_EQ(row->avmMini_rwc, FF(1));

    validate_trace_proof(std::move(trace));
}

// Test on multiplication by zero over finite field type.
TEST_F(AvmMiniArithmeticTestsFF, multiplicationByZero)
{
    trace_builder.call_data_copy(0, 1, 0, std::vector<FF>{ 127 });

    //                             Memory layout:    [127,0,0,0,0,0,....]
    trace_builder.mul(0, 1, 2, AvmMemoryTag::ff); // [127,0,0,0,0,0....]
    trace_builder.return_op(0, 3);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the multiplication selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_mul == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->avmMini_ic, FF(0));
    EXPECT_EQ(row->avmMini_mem_idx_c, FF(2));
    EXPECT_EQ(row->avmMini_mem_op_c, FF(1));
    EXPECT_EQ(row->avmMini_rwc, FF(1));

    validate_trace_proof(std::move(trace));
}

// Test on basic division over finite field type.
TEST_F(AvmMiniArithmeticTestsFF, division)
{
    trace_builder.call_data_copy(0, 2, 0, std::vector<FF>{ 15, 315 });

    //                             Memory layout:    [15,315,0,0,0,0,....]
    trace_builder.div(1, 0, 2, AvmMemoryTag::ff); // [15,315,21,0,0,0....]
    trace_builder.return_op(0, 3);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the division selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_div == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->avmMini_ic, FF(21));
    EXPECT_EQ(row->avmMini_mem_idx_c, FF(2));
    EXPECT_EQ(row->avmMini_mem_op_c, FF(1));
    EXPECT_EQ(row->avmMini_rwc, FF(1));

    validate_trace_proof(std::move(trace));
}

// Test on division with zero numerator over finite field type.
TEST_F(AvmMiniArithmeticTestsFF, divisionNumeratorZero)
{
    trace_builder.call_data_copy(0, 1, 0, std::vector<FF>{ 15 });

    //                             Memory layout:    [15,0,0,0,0,0,....]
    trace_builder.div(1, 0, 0, AvmMemoryTag::ff); // [0,0,0,0,0,0....]
    trace_builder.return_op(0, 3);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the division selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_div == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->avmMini_ic, FF(0));
    EXPECT_EQ(row->avmMini_mem_idx_c, FF(0));
    EXPECT_EQ(row->avmMini_mem_op_c, FF(1));
    EXPECT_EQ(row->avmMini_rwc, FF(1));

    validate_trace_proof(std::move(trace));
}

// Test on division by zero over finite field type.
// We check that the operator error flag is raised.
TEST_F(AvmMiniArithmeticTestsFF, divisionByZeroError)
{
    trace_builder.call_data_copy(0, 1, 0, std::vector<FF>{ 15 });

    //                             Memory layout:    [15,0,0,0,0,0,....]
    trace_builder.div(0, 1, 2, AvmMemoryTag::ff); // [15,0,0,0,0,0....]
    trace_builder.halt();
    auto trace = trace_builder.finalize();

    // Find the first row enabling the division selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_div == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->avmMini_ic, FF(0));
    EXPECT_EQ(row->avmMini_mem_idx_c, FF(2));
    EXPECT_EQ(row->avmMini_mem_op_c, FF(1));
    EXPECT_EQ(row->avmMini_rwc, FF(1));
    EXPECT_EQ(row->avmMini_op_err, FF(1));

    validate_trace_proof(std::move(trace));
}

// Test on division of zero by zero over finite field type.
// We check that the operator error flag is raised.
TEST_F(AvmMiniArithmeticTestsFF, divisionZeroByZeroError)
{
    //                             Memory layout:    [0,0,0,0,0,0,....]
    trace_builder.div(0, 1, 2, AvmMemoryTag::ff); // [0,0,0,0,0,0....]
    trace_builder.halt();
    auto trace = trace_builder.finalize();

    // Find the first row enabling the division selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_div == FF(1); });

    // Check that the correct result is stored at the expected memory location.
    EXPECT_TRUE(row != trace.end());
    EXPECT_EQ(row->avmMini_ic, FF(0));
    EXPECT_EQ(row->avmMini_mem_idx_c, FF(2));
    EXPECT_EQ(row->avmMini_mem_op_c, FF(1));
    EXPECT_EQ(row->avmMini_rwc, FF(1));
    EXPECT_EQ(row->avmMini_op_err, FF(1));

    validate_trace_proof(std::move(trace));
}

// Testing an execution of the different arithmetic opcodes over finite field
// and finishing with a division by zero. The chosen combination is arbitrary.
// We only test that the proof can be correctly generated and verified.
// No check on the evaluation is performed here.
TEST_F(AvmMiniArithmeticTestsFF, mixedOperationsWithError)
{
    trace_builder.call_data_copy(0, 3, 2, std::vector<FF>{ 45, 23, 12 });

    //                             Memory layout:    [0,0,45,23,12,0,0,0,....]
    trace_builder.add(2, 3, 4, AvmMemoryTag::ff); // [0,0,45,23,68,0,0,0,....]
    trace_builder.add(4, 5, 5, AvmMemoryTag::ff); // [0,0,45,23,68,68,0,0,....]
    trace_builder.add(5, 5, 5, AvmMemoryTag::ff); // [0,0,45,23,68,136,0,0,....]
    trace_builder.add(5, 6, 7, AvmMemoryTag::ff); // [0,0,45,23,68,136,0,136,0....]
    trace_builder.sub(7, 6, 8, AvmMemoryTag::ff); // [0,0,45,23,68,136,0,136,136,0....]
    trace_builder.mul(8, 8, 8, AvmMemoryTag::ff); // [0,0,45,23,68,136,0,136,136^2,0....]
    trace_builder.div(3, 5, 1, AvmMemoryTag::ff); // [0,23*136^(-1),45,23,68,136,0,136,136^2,0....]
    trace_builder.div(1, 1, 9, AvmMemoryTag::ff); // [0,23*136^(-1),45,23,68,136,0,136,136^2,1,0....]
    trace_builder.div(
        9, 0, 4, AvmMemoryTag::ff); // [0,23*136^(-1),45,23,1/0,136,0,136,136^2,1,0....] Error: division by 0
    trace_builder.halt();

    auto trace = trace_builder.finalize();
    validate_trace_proof(std::move(trace));
}

/******************************************************************************
 * Positive Tests - U8
 ******************************************************************************/

// Test on basic addition over u8 type.
TEST_F(AvmMiniArithmeticTestsU8, addition)
{
    // trace_builder
    trace_builder.set(62, 0, AvmMemoryTag::u8);
    trace_builder.set(29, 1, AvmMemoryTag::u8);

    //                             Memory layout:    [62,29,0,0,0,....]
    trace_builder.add(0, 1, 2, AvmMemoryTag::u8); // [62,29,91,0,0,....]
    trace_builder.return_op(2, 1);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace, FF(62), FF(29), FF(91), FF(0), FF(1), FF(2), AvmMemoryTag::u8);

    EXPECT_EQ(alu_row.aluChip_alu_u8_tag, FF(1));
    EXPECT_EQ(alu_row.aluChip_alu_cf, FF(0));
    EXPECT_EQ(alu_row.aluChip_alu_u8_r0, FF(91));

    validate_trace_proof(std::move(trace));
}

// Test on basic addition over u8 type with carry.
TEST_F(AvmMiniArithmeticTestsU8, additionCarry)
{
    // trace_builder
    trace_builder.set(159, 0, AvmMemoryTag::u8);
    trace_builder.set(100, 1, AvmMemoryTag::u8);

    //                             Memory layout:    [159,100,0,0,0,....]
    trace_builder.add(0, 1, 2, AvmMemoryTag::u8); // [159,100,3,0,0,....]
    trace_builder.return_op(2, 1);
    auto trace = trace_builder.finalize();

    auto alu_row = common_validate_add(trace, FF(159), FF(100), FF(3), FF(0), FF(1), FF(2), AvmMemoryTag::u8);

    EXPECT_EQ(alu_row.aluChip_alu_u8_tag, FF(1));
    EXPECT_EQ(alu_row.aluChip_alu_cf, FF(1));
    EXPECT_EQ(alu_row.aluChip_alu_u8_r0, FF(3));

    validate_trace_proof(std::move(trace));
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
 * if the arithmetic operation and not the layout of the memory trace.
 *
 * Finding the row pertaining to the arithmetic operation is done through
 * a scan of all rows and stopping at the first one with the corresponding
 * operator selector. This mechanism is used with the hope that these unit tests
 * will still correctly work along the development of the AVM.
 ******************************************************************************/

// Test on basic incorrect addition over finite field type.
TEST_F(AvmMiniArithmeticNegativeTestsFF, addition)
{
    trace_builder.call_data_copy(0, 3, 0, std::vector<FF>{ 37, 4, 11 });

    //                             Memory layout:    [37,4,11,0,0,0,....]
    trace_builder.add(0, 1, 4, AvmMemoryTag::ff); // [37,4,11,0,41,0,....]
    trace_builder.halt();
    auto trace = trace_builder.finalize();

    auto select_row = [](Row r) { return r.avmMini_sel_op_add == FF(1); };
    mutate_ic_in_trace(trace, std::move(select_row), FF(40), true);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_ADDITION_FF");
}

// Test on basic incorrect subtraction over finite field type.
TEST_F(AvmMiniArithmeticNegativeTestsFF, subtraction)
{
    trace_builder.call_data_copy(0, 3, 0, std::vector<FF>{ 8, 4, 17 });

    //                             Memory layout:    [8,4,17,0,0,0,....]
    trace_builder.sub(2, 0, 1, AvmMemoryTag::ff); // [8,9,17,0,0,0....]
    auto trace = trace_builder.finalize();

    auto select_row = [](Row r) { return r.avmMini_sel_op_sub == FF(1); };
    mutate_ic_in_trace(trace, std::move(select_row), FF(-9));

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_SUBTRACTION_FF");
}

// Test on basic incorrect multiplication over finite field type.
TEST_F(AvmMiniArithmeticNegativeTestsFF, multiplication)
{
    trace_builder.call_data_copy(0, 3, 0, std::vector<FF>{ 5, 0, 20 });

    //                             Memory layout:    [5,0,20,0,0,0,....]
    trace_builder.mul(2, 0, 1, AvmMemoryTag::ff); // [5,100,20,0,0,0....]
    auto trace = trace_builder.finalize();

    auto select_row = [](Row r) { return r.avmMini_sel_op_mul == FF(1); };
    mutate_ic_in_trace(trace, std::move(select_row), FF(1000));

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_MULTIPLICATION_FF");
}

// Test on basic incorrect division over finite field type.
TEST_F(AvmMiniArithmeticNegativeTestsFF, divisionFF)
{
    trace_builder.call_data_copy(0, 2, 0, std::vector<FF>{ 15, 315 });

    //                             Memory layout:    [15,315,0,0,0,0,....]
    trace_builder.div(1, 0, 2, AvmMemoryTag::ff); // [15,315,21,0,0,0....]
    auto trace = trace_builder.finalize();

    auto select_row = [](Row r) { return r.avmMini_sel_op_div == FF(1); };
    mutate_ic_in_trace(trace, std::move(select_row), FF(0));

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_DIVISION_FF");
}

// Test where division is not by zero but an operation error is wrongly raised
// in the trace.
TEST_F(AvmMiniArithmeticNegativeTestsFF, divisionNoZeroButError)
{
    trace_builder.call_data_copy(0, 2, 0, std::vector<FF>{ 15, 315 });

    //                             Memory layout:    [15,315,0,0,0,0,....]
    trace_builder.div(1, 0, 2, AvmMemoryTag::ff); // [15,315,21,0,0,0....]
    auto trace = trace_builder.finalize();

    // Find the first row enabling the division selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_div == FF(1); });

    size_t const index = static_cast<size_t>(row - trace.begin());

    // Activate the operator error
    trace[index].avmMini_op_err = FF(1);
    auto trace2 = trace;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_DIVISION_ZERO_ERR1");

    // Even more malicious, one makes the first relation passes by setting the inverse to zero.
    trace2[index].avmMini_inv = FF(0);
    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace2)), "SUBOP_DIVISION_ZERO_ERR2");
}

// Test with division by zero occurs and no error is raised (remove error flag)
TEST_F(AvmMiniArithmeticNegativeTestsFF, divisionByZeroNoError)
{
    trace_builder.call_data_copy(0, 1, 0, std::vector<FF>{ 15 });

    //                             Memory layout:    [15,0,0,0,0,0,....]
    trace_builder.div(0, 1, 2, AvmMemoryTag::ff); // [15,0,0,0,0,0....]
    trace_builder.halt();
    auto trace = trace_builder.finalize();

    // Find the first row enabling the division selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_div == FF(1); });

    // Remove the operator error flag
    row->avmMini_op_err = FF(0);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_DIVISION_FF");
}

// Test with division of zero by zero occurs and no error is raised (remove error flag)
TEST_F(AvmMiniArithmeticNegativeTestsFF, divisionZeroByZeroNoError)
{
    //                             Memory layout:    [0,0,0,0,0,0,....]
    trace_builder.div(0, 1, 2, AvmMemoryTag::ff); // [0,0,0,0,0,0....]
    auto trace = trace_builder.finalize();

    // Find the first row enabling the division selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_div == FF(1); });

    // Remove the operator error flag
    row->avmMini_op_err = FF(0);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_DIVISION_ZERO_ERR1");
}

// Test that error flag cannot be raised for a non-relevant operation such as
// the addition, subtraction, multiplication.
TEST_F(AvmMiniArithmeticNegativeTestsFF, operationWithErrorFlag)
{
    trace_builder.call_data_copy(0, 3, 0, std::vector<FF>{ 37, 4, 11 });

    //                             Memory layout:    [37,4,11,0,0,0,....]
    trace_builder.add(0, 1, 4, AvmMemoryTag::ff); // [37,4,11,0,41,0,....]
    trace_builder.return_op(0, 5);
    auto trace = trace_builder.finalize();

    // Find the first row enabling the addition selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_add == FF(1); });

    // Activate the operator error
    row->avmMini_op_err = FF(1);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_ERROR_RELEVANT_OP");

    trace_builder.reset();

    trace_builder.call_data_copy(0, 3, 0, std::vector<FF>{ 8, 4, 17 });

    //                             Memory layout:    [8,4,17,0,0,0,....]
    trace_builder.sub(2, 0, 1, AvmMemoryTag::ff); // [8,9,17,0,0,0....]
    trace_builder.return_op(0, 3);
    trace = trace_builder.finalize();

    // Find the first row enabling the subtraction selector
    row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_sub == FF(1); });

    // Activate the operator error
    row->avmMini_op_err = FF(1);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_ERROR_RELEVANT_OP");

    trace_builder.reset();

    trace_builder.call_data_copy(0, 3, 0, std::vector<FF>{ 5, 0, 20 });

    //                             Memory layout:    [5,0,20,0,0,0,....]
    trace_builder.mul(2, 0, 1, AvmMemoryTag::ff); // [5,100,20,0,0,0....]
    trace_builder.return_op(0, 3);
    trace = trace_builder.finalize();

    // Find the first row enabling the multiplication selector
    row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_mul == FF(1); });

    // Activate the operator error
    row->avmMini_op_err = FF(1);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "SUBOP_ERROR_RELEVANT_OP");
}

} // namespace tests_avm