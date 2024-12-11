#include "barretenberg/vm/avm/tests/helpers.test.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/mem_trace.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "common.test.hpp"
#include "gtest/gtest.h"
#include <cstddef>
#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace tests_avm {

using namespace bb;
using namespace bb::avm_trace;
using namespace testing;

class AvmMemOpcodeTests : public ::testing::Test {
  public:
    AvmMemOpcodeTests()
        : public_inputs(generate_base_public_inputs())
        , trace_builder(
              AvmTraceBuilder(public_inputs).set_full_precomputed_tables(false).set_range_check_required(false))
    {
        srs::init_crs_factory("../srs_db/ignition");
    }

    AvmPublicInputs public_inputs;
    AvmTraceBuilder trace_builder;

  protected:
    std::vector<Row> trace;
    size_t main_row_idx;
    size_t mem_a_row_idx;
    size_t mem_b_row_idx;
    size_t mem_c_row_idx;
    size_t mem_d_row_idx;
    size_t mem_ind_a_row_idx;
    size_t mem_ind_b_row_idx;
    size_t mem_ind_c_row_idx;
    size_t mem_ind_d_row_idx;

    void build_mov_trace(bool indirect,
                         uint128_t const& val,
                         uint32_t src_offset,
                         uint32_t dst_offset,
                         AvmMemoryTag tag,
                         uint32_t dir_src_offset = 0,
                         uint32_t dir_dst_offset = 0)
    {
        if (indirect) {
            trace_builder.op_set(0, dir_src_offset, src_offset, AvmMemoryTag::U32);
            trace_builder.op_set(0, dir_dst_offset, dst_offset, AvmMemoryTag::U32);
            trace_builder.op_set(0, uint256_t::from_uint128(val), dir_src_offset, tag);
        } else {
            trace_builder.op_set(0, uint256_t::from_uint128(val), src_offset, tag);
        }

        trace_builder.op_mov(indirect ? 3 : 0, src_offset, dst_offset);
        trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
        trace_builder.op_return(0, 0, 100);
        trace = trace_builder.finalize();
    }

    static std::function<bool(Row)> gen_matcher(FF clk, uint32_t sub_clk)
    {
        return [clk, sub_clk](Row r) { return r.mem_tsp == FF(AvmMemTraceBuilder::NUM_SUB_CLK) * clk + sub_clk; };
    };

    void compute_index_a(FF clk, bool indirect)
    {
        // Find the memory trace position corresponding to the load sub-operation of register ia.
        auto row =
            std::ranges::find_if(trace.begin(), trace.end(), gen_matcher(clk, AvmMemTraceBuilder::SUB_CLK_LOAD_A));
        ASSERT_TRUE(row != trace.end());
        mem_a_row_idx = static_cast<size_t>(row - trace.begin());

        // Find the memory trace position of the indirect load for register ia.
        if (indirect) {
            row = std::ranges::find_if(
                trace.begin(), trace.end(), gen_matcher(clk, AvmMemTraceBuilder::SUB_CLK_IND_LOAD_A));
            ASSERT_TRUE(row != trace.end());
            mem_ind_a_row_idx = static_cast<size_t>(row - trace.begin());
        }
    }

    void compute_index_c(FF clk, bool indirect)
    {
        // Find the memory trace position corresponding to the write sub-operation of register ic.
        auto row =
            std::ranges::find_if(trace.begin(), trace.end(), gen_matcher(clk, AvmMemTraceBuilder::SUB_CLK_STORE_C));
        ASSERT_TRUE(row != trace.end());
        mem_c_row_idx = static_cast<size_t>(row - trace.begin());

        // Find the memory trace position of the indirect load for register ic.
        if (indirect) {
            row = std::ranges::find_if(
                trace.begin(), trace.end(), gen_matcher(clk, AvmMemTraceBuilder::SUB_CLK_IND_LOAD_C));
            ASSERT_TRUE(row != trace.end());
            mem_ind_c_row_idx = static_cast<size_t>(row - trace.begin());
        }
    }

    void compute_mov_indices(bool indirect)
    {
        // Find the first row enabling the MOV selector
        auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_mov == FF(1); });
        ASSERT_TRUE(row != trace.end());
        main_row_idx = static_cast<size_t>(row - trace.begin());

        auto clk = row->main_clk;

        compute_index_a(clk, indirect);
        compute_index_c(clk, indirect);
    }

    void validate_mov_trace(bool indirect,
                            uint128_t const& val,
                            uint32_t src_offset,
                            uint32_t dst_offset,
                            AvmMemoryTag tag,
                            uint32_t dir_src_offset = 0,
                            uint32_t dir_dst_offset = 0,
                            bool indirect_uninitialized = false)
    {
        compute_mov_indices(indirect);
        FF const val_ff = uint256_t::from_uint128(val);
        auto const& main_row = trace.at(main_row_idx);

        if (indirect) {
            EXPECT_THAT(
                main_row,
                AllOf(MAIN_ROW_FIELD_EQ(mem_addr_a, dir_src_offset), MAIN_ROW_FIELD_EQ(mem_addr_c, dir_dst_offset)));
        }
        EXPECT_THAT(main_row,
                    AllOf(MAIN_ROW_FIELD_EQ(sel_op_mov, 1),
                          MAIN_ROW_FIELD_EQ(sel_mov_ia_to_ic, 1),
                          MAIN_ROW_FIELD_EQ(ia, val_ff),
                          MAIN_ROW_FIELD_EQ(ib, 0),
                          MAIN_ROW_FIELD_EQ(ic, val_ff),
                          MAIN_ROW_FIELD_EQ(r_in_tag, static_cast<uint32_t>(tag)),
                          MAIN_ROW_FIELD_EQ(w_in_tag, static_cast<uint32_t>(tag))));

        auto const& mem_a_row = trace.at(mem_a_row_idx);

        EXPECT_THAT(mem_a_row,
                    AllOf(MEM_ROW_FIELD_EQ(tag_err, 0),
                          MEM_ROW_FIELD_EQ(r_in_tag, static_cast<uint32_t>(tag)),
                          MEM_ROW_FIELD_EQ(tag, static_cast<uint32_t>(tag)),
                          MEM_ROW_FIELD_EQ(sel_mov_ia_to_ic, 1),
                          MEM_ROW_FIELD_EQ(addr, indirect ? dir_src_offset : src_offset),
                          MEM_ROW_FIELD_EQ(val, val_ff),
                          MEM_ROW_FIELD_EQ(rw, 0),
                          MEM_ROW_FIELD_EQ(sel_op_a, 1)));

        auto const& mem_c_row = trace.at(mem_c_row_idx);

        EXPECT_THAT(mem_c_row,
                    AllOf(MEM_ROW_FIELD_EQ(tag_err, 0),
                          MEM_ROW_FIELD_EQ(w_in_tag, static_cast<uint32_t>(tag)),
                          MEM_ROW_FIELD_EQ(tag, static_cast<uint32_t>(tag)),
                          MEM_ROW_FIELD_EQ(addr, indirect ? dir_dst_offset : dst_offset),
                          MEM_ROW_FIELD_EQ(val, val_ff),
                          MEM_ROW_FIELD_EQ(sel_op_c, 1)));

        if (indirect) {
            auto const& mem_ind_a_row = trace.at(mem_ind_a_row_idx);
            EXPECT_THAT(mem_ind_a_row,
                        AllOf(MEM_ROW_FIELD_EQ(tag_err, indirect_uninitialized ? 1 : 0),
                              MEM_ROW_FIELD_EQ(r_in_tag, static_cast<uint32_t>(AvmMemoryTag::U32)),
                              MEM_ROW_FIELD_EQ(tag,
                                               indirect_uninitialized ? static_cast<uint32_t>(AvmMemoryTag::FF)
                                                                      : static_cast<uint32_t>(AvmMemoryTag::U32)),
                              MEM_ROW_FIELD_EQ(addr, src_offset),
                              MEM_ROW_FIELD_EQ(val, dir_src_offset),
                              MEM_ROW_FIELD_EQ(sel_resolve_ind_addr_a, 1)));

            auto const& mem_ind_c_row = trace.at(mem_ind_c_row_idx);
            EXPECT_THAT(mem_ind_c_row,
                        AllOf(MEM_ROW_FIELD_EQ(tag_err, 0),
                              MEM_ROW_FIELD_EQ(r_in_tag, static_cast<uint32_t>(AvmMemoryTag::U32)),
                              MEM_ROW_FIELD_EQ(tag, static_cast<uint32_t>(AvmMemoryTag::U32)),
                              MEM_ROW_FIELD_EQ(addr, dst_offset),
                              MEM_ROW_FIELD_EQ(val, dir_dst_offset),
                              MEM_ROW_FIELD_EQ(sel_resolve_ind_addr_c, 1)));
        }

        validate_trace(std::move(trace), public_inputs);
    }
};

class AvmMemOpcodeNegativeTests : public AvmMemOpcodeTests {
  protected:
    void SetUp() override { GTEST_SKIP(); }
};

/******************************************************************************
 *
 * MEMORY OPCODE POSITIVE TESTS
 *
 ******************************************************************************/

/******************************************************************************
 * MOV Opcode
 ******************************************************************************/

TEST_F(AvmMemOpcodeTests, basicMov)
{
    build_mov_trace(false, 42, 9, 13, AvmMemoryTag::U64);
    validate_mov_trace(false, 42, 9, 13, AvmMemoryTag::U64);
}

TEST_F(AvmMemOpcodeTests, sameAddressMov)
{
    build_mov_trace(false, 11, 356, 356, AvmMemoryTag::U16);
    validate_mov_trace(false, 11, 356, 356, AvmMemoryTag::U16);
}

TEST_F(AvmMemOpcodeTests, uninitializedValueMov)
{
    trace_builder.op_set(0, 4, 1, AvmMemoryTag::U32);
    trace_builder.op_mov(0, 0, 1);
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);
    trace = trace_builder.finalize();

    validate_mov_trace(false, 0, 0, 1, AvmMemoryTag::FF);
}

TEST_F(AvmMemOpcodeTests, indUninitializedValueMov)
{
    // TODO(#9995): Re-enable once we have error handling on wrong address resolution
    GTEST_SKIP();

    trace_builder.op_set(0, 1, 3, AvmMemoryTag::U32);
    trace_builder.op_set(0, 4, 1, AvmMemoryTag::U32);
    trace_builder.op_set(0, 5, 2, AvmMemoryTag::U32);
    trace_builder.op_mov(3, 2, 3);
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);
    trace = trace_builder.finalize();

    validate_mov_trace(true, 0, 2, 3, AvmMemoryTag::FF, 5, 1);
}

TEST_F(AvmMemOpcodeTests, indUninitializedAddrMov)
{
    // TODO(#9995): Re-enable once we have error handling on wrong address resolution
    GTEST_SKIP();

    trace_builder.op_set(0, 1, 3, AvmMemoryTag::U32);
    trace_builder.op_set(0, 4, 1, AvmMemoryTag::U32);
    trace_builder.op_mov(3, 2, 3);
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);
    trace = trace_builder.finalize();

    validate_mov_trace(true, 0, 2, 3, AvmMemoryTag::FF, 0, 1, true);
}

TEST_F(AvmMemOpcodeTests, indirectMov)
{
    // Re-enable once we constrain address resolution
    GTEST_SKIP();

    build_mov_trace(true, 23, 0, 1, AvmMemoryTag::U8, 2, 3);
    validate_mov_trace(true, 23, 0, 1, AvmMemoryTag::U8, 2, 3);
}

TEST_F(AvmMemOpcodeTests, indirectMovInvalidAddressTag)
{
    // TODO(#9995): Re-enable once we have error handling on wrong address resolution
    GTEST_SKIP();

    trace_builder.op_set(0, 15, 100, AvmMemoryTag::U32);
    trace_builder.op_set(0, 16, 101, AvmMemoryTag::U128); // This will make the indirect load failing.
    trace_builder.op_set(0, 5, 15, AvmMemoryTag::FF);
    trace_builder.op_mov(3, 100, 101);
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);
    trace = trace_builder.finalize();

    compute_mov_indices(true);

    EXPECT_EQ(trace.at(main_row_idx).main_tag_err, 1);
    EXPECT_THAT(trace.at(mem_ind_c_row_idx),
                AllOf(MEM_ROW_FIELD_EQ(tag_err, 1),
                      MEM_ROW_FIELD_EQ(tag, static_cast<uint32_t>(AvmMemoryTag::U128)),
                      MEM_ROW_FIELD_EQ(r_in_tag, static_cast<uint32_t>(AvmMemoryTag::U32)),
                      MEM_ROW_FIELD_EQ(sel_resolve_ind_addr_c, 1)));

    validate_trace(std::move(trace), public_inputs, {}, {});
}

/******************************************************************************
 * SET Opcode
 ******************************************************************************/

TEST_F(AvmMemOpcodeTests, directSet)
{
    trace_builder.op_set(0, 5683, 99, AvmMemoryTag::U128);
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);
    trace = trace_builder.finalize();

    compute_index_c(1, false);
    auto const& row = trace.at(1);

    EXPECT_THAT(row,
                AllOf(MAIN_ROW_FIELD_EQ(tag_err, 0),
                      MAIN_ROW_FIELD_EQ(ic, 5683),
                      MAIN_ROW_FIELD_EQ(mem_addr_c, 99),
                      MAIN_ROW_FIELD_EQ(sel_mem_op_c, 1),
                      MAIN_ROW_FIELD_EQ(rwc, 1),
                      MAIN_ROW_FIELD_EQ(sel_resolve_ind_addr_c, 0)));

    EXPECT_THAT(trace.at(mem_c_row_idx),
                AllOf(MEM_ROW_FIELD_EQ(val, 5683),
                      MEM_ROW_FIELD_EQ(addr, 99),
                      MEM_ROW_FIELD_EQ(sel_op_c, 1),
                      MEM_ROW_FIELD_EQ(rw, 1),
                      MEM_ROW_FIELD_EQ(sel_resolve_ind_addr_c, 0)));

    validate_trace(std::move(trace), public_inputs);
}

TEST_F(AvmMemOpcodeTests, indirectSet)
{
    trace_builder.op_set(0, 100, 10, AvmMemoryTag::U32);
    trace_builder.op_set(1, 1979, 10, AvmMemoryTag::U64); // Set 1979 at memory index 100
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);
    trace = trace_builder.finalize();

    // TODO(JEANMON): Turn following boolean to true once we have constraining address resolution
    compute_index_c(2, false);
    auto const& row = trace.at(2);

    EXPECT_THAT(row,
                AllOf(MAIN_ROW_FIELD_EQ(tag_err, 0),
                      MAIN_ROW_FIELD_EQ(ic, 1979),
                      MAIN_ROW_FIELD_EQ(mem_addr_c, 100),
                      MAIN_ROW_FIELD_EQ(sel_mem_op_c, 1),
                      MAIN_ROW_FIELD_EQ(rwc, 1)));
    // TODO(JEANMON): Uncomment once we have a constraining address resolution
    // MAIN_ROW_FIELD_EQ(sel_resolve_ind_addr_c, 1),
    // MAIN_ROW_FIELD_EQ(ind_addr_c, 10)));

    EXPECT_THAT(trace.at(mem_c_row_idx),
                AllOf(MEM_ROW_FIELD_EQ(val, 1979),
                      MEM_ROW_FIELD_EQ(addr, 100),
                      MEM_ROW_FIELD_EQ(sel_op_c, 1),
                      MEM_ROW_FIELD_EQ(rw, 1),
                      MEM_ROW_FIELD_EQ(sel_resolve_ind_addr_c, 0),
                      MEM_ROW_FIELD_EQ(w_in_tag, static_cast<uint32_t>(AvmMemoryTag::U64)),
                      MEM_ROW_FIELD_EQ(tag, static_cast<uint32_t>(AvmMemoryTag::U64))));

    // TODO(JEANMON): Uncomment once we have a constraining address resolution
    // EXPECT_THAT(trace.at(mem_ind_c_row_idx),
    //             AllOf(MEM_ROW_FIELD_EQ(val, 100),
    //                   MEM_ROW_FIELD_EQ(addr, 10),
    //                   MEM_ROW_FIELD_EQ(sel_op_c, 0),
    //                   MEM_ROW_FIELD_EQ(rw, 0),
    //                   MEM_ROW_FIELD_EQ(sel_resolve_ind_addr_c, 1),
    //                   MEM_ROW_FIELD_EQ(r_in_tag, static_cast<uint32_t>(AvmMemoryTag::U32)),
    //                   MEM_ROW_FIELD_EQ(tag, static_cast<uint32_t>(AvmMemoryTag::U32))));

    validate_trace(std::move(trace), public_inputs);
}

TEST_F(AvmMemOpcodeTests, indirectSetWrongTag)
{
    // TODO(#9995): Re-enable once we have error handling on wrong address resolution
    GTEST_SKIP();

    trace_builder.op_set(0, 100, 10, AvmMemoryTag::U8);   // The address 100 has incorrect tag U8.
    trace_builder.op_set(1, 1979, 10, AvmMemoryTag::U64); // Set 1979 at memory index 100
    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);
    trace = trace_builder.finalize();

    compute_index_c(2, true);
    auto const& row = trace.at(2);

    EXPECT_THAT(row,
                AllOf(MAIN_ROW_FIELD_EQ(tag_err, 1),
                      MAIN_ROW_FIELD_EQ(sel_mem_op_c, 1),
                      MAIN_ROW_FIELD_EQ(rwc, 1),
                      MAIN_ROW_FIELD_EQ(sel_resolve_ind_addr_c, 1),
                      MAIN_ROW_FIELD_EQ(ind_addr_c, 10)));

    EXPECT_THAT(trace.at(mem_ind_c_row_idx),
                AllOf(MEM_ROW_FIELD_EQ(val, 100),
                      MEM_ROW_FIELD_EQ(addr, 10),
                      MEM_ROW_FIELD_EQ(sel_op_c, 0),
                      MEM_ROW_FIELD_EQ(rw, 0),
                      MEM_ROW_FIELD_EQ(sel_resolve_ind_addr_c, 1),
                      MEM_ROW_FIELD_EQ(r_in_tag, static_cast<uint32_t>(AvmMemoryTag::U32)),
                      MEM_ROW_FIELD_EQ(tag, static_cast<uint32_t>(AvmMemoryTag::U8)),
                      MEM_ROW_FIELD_EQ(tag_err, 1)));

    validate_trace(std::move(trace), public_inputs);
}

/******************************************************************************
 *
 * MEMORY OPCODE NEGATIVE TESTS
 *
 ******************************************************************************/

/******************************************************************************
 * MOV Opcode
 ******************************************************************************/

TEST_F(AvmMemOpcodeNegativeTests, movWrongOutputErrorTag)
{
    build_mov_trace(false, 234, 0, 1, AvmMemoryTag::U8);
    compute_mov_indices(false);
    trace.at(main_row_idx).main_tag_err = 1;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "INCL_MEM_TAG_ERR");
}

TEST_F(AvmMemOpcodeNegativeTests, movWrongOutputValue)
{
    build_mov_trace(false, 234, 0, 1, AvmMemoryTag::U8);
    compute_mov_indices(false);
    trace.at(main_row_idx).main_ic = 233;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "MOV_SAME_VALUE_A");
}

TEST_F(AvmMemOpcodeNegativeTests, indMovWrongOutputValue)
{
    build_mov_trace(true, 8732, 23, 24, AvmMemoryTag::U16, 432, 876);
    compute_mov_indices(true);
    trace.at(main_row_idx).main_ic = 8733;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "MOV_SAME_VALUE_A");
}

// We want to test that the output tag for MOV cannot be altered.
// In this test, we modify the r_in_tag for load operation to Ia.
// Then, we propagate the error tag and the copy of r_in_tag to the
// main trace and the memory entry related to store operation from Ic.
TEST_F(AvmMemOpcodeNegativeTests, movWrongOutputTagLoadIa)
{
    FF const tag_u64 = FF(static_cast<uint32_t>(AvmMemoryTag::U64));
    FF const tag_u8 = FF(static_cast<uint32_t>(AvmMemoryTag::U8));
    FF const one_min_inverse_diff = FF(1) - (tag_u64 - tag_u8).invert();

    build_mov_trace(false, 234, 0, 1, AvmMemoryTag::U8);
    compute_mov_indices(false);

    auto trace_tmp = trace;

    trace.at(mem_a_row_idx).mem_r_in_tag = tag_u64;
    trace.at(mem_a_row_idx).mem_tag_err = 1;
    trace.at(mem_a_row_idx).mem_one_min_inv = one_min_inverse_diff;
    trace.at(mem_c_row_idx).mem_tag = tag_u64;
    trace.at(mem_c_row_idx).mem_w_in_tag = tag_u64;
    trace.at(main_row_idx).main_r_in_tag = tag_u64;
    trace.at(main_row_idx).main_w_in_tag = tag_u64;
    trace.at(main_row_idx).main_tag_err = 1;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "MOV_SAME_TAG");
}

// Same as above but one tries to disable the selector of MOV opcode in
// the load operation.
TEST_F(AvmMemOpcodeNegativeTests, movWrongOutputTagDisabledSelector)
{
    FF const tag_u64 = FF(static_cast<uint32_t>(AvmMemoryTag::U64));
    FF const tag_u8 = FF(static_cast<uint32_t>(AvmMemoryTag::U8));
    FF const one_min_inverse_diff = FF(1) - (tag_u64 - tag_u8).invert();

    build_mov_trace(false, 234, 0, 1, AvmMemoryTag::U8);
    compute_mov_indices(false);

    trace.at(mem_a_row_idx).mem_r_in_tag = tag_u64;
    trace.at(mem_a_row_idx).mem_w_in_tag = tag_u64;
    trace.at(mem_a_row_idx).mem_tag_err = 1;
    trace.at(mem_a_row_idx).mem_one_min_inv = one_min_inverse_diff;
    trace.at(mem_a_row_idx).mem_sel_mov_ia_to_ic = 0;
    trace.at(mem_c_row_idx).mem_tag = tag_u64;
    trace.at(mem_c_row_idx).mem_r_in_tag = tag_u64;
    trace.at(mem_c_row_idx).mem_w_in_tag = tag_u64;
    trace.at(main_row_idx).main_r_in_tag = tag_u64;
    trace.at(main_row_idx).main_w_in_tag = tag_u64;
    trace.at(main_row_idx).main_tag_err = 1;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "PERM_MAIN_MEM_A");
}

// Same goal as above but we alter the w_in_tag in the main trace
// and propagate this to the store operation.
TEST_F(AvmMemOpcodeNegativeTests, movWrongOutputTagInMainTrace)
{
    FF const tag_u64 = FF(static_cast<uint32_t>(AvmMemoryTag::U64));

    build_mov_trace(false, 234, 0, 1, AvmMemoryTag::U8);
    compute_mov_indices(false);

    trace.at(mem_c_row_idx).mem_tag = tag_u64;
    trace.at(mem_c_row_idx).mem_w_in_tag = tag_u64;
    trace.at(main_row_idx).main_w_in_tag = tag_u64;
    trace.at(main_row_idx).main_tag_err = 1;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "MOV_MAIN_SAME_TAG");
}

// The manipulation of the tag occurs in the store operation.
TEST_F(AvmMemOpcodeNegativeTests, movWrongOutputTagMainTraceRead)
{
    FF const tag_u64 = FF(static_cast<uint32_t>(AvmMemoryTag::U64));

    build_mov_trace(false, 234, 0, 1, AvmMemoryTag::U8);
    compute_mov_indices(false);

    trace.at(mem_c_row_idx).mem_tag = tag_u64;
    trace.at(mem_c_row_idx).mem_w_in_tag = tag_u64;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), "PERM_MAIN_MEM_C");
}

} // namespace tests_avm
