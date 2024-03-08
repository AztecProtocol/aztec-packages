#include "avm_common.test.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_mem_trace.hpp"
#include "barretenberg/vm/tests/helpers.test.hpp"
#include <cstddef>
#include <gtest/gtest.h>
#include <vector>

using namespace bb;

namespace tests_avm {
using namespace bb::avm_trace;

class AvmInterTableTests : public ::testing::Test {
  public:
    AvmTraceBuilder trace_builder;

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

class AvmPermMainAluNegativeTests : public AvmInterTableTests {
  protected:
    std::vector<Row> trace;
    size_t main_idx;
    size_t mem_idx;
    size_t alu_idx;

    void SetUp() override
    {
        AvmInterTableTests::SetUp();

        trace_builder.set(19, 0, AvmMemoryTag::U64);
        trace_builder.set(15, 1, AvmMemoryTag::U64);
        trace_builder.op_add(0, 1, 1, AvmMemoryTag::U64); // 19 + 15 = 34
        trace_builder.op_add(0, 1, 1, AvmMemoryTag::U64); // 19 + 34 = 53
        trace_builder.op_mul(0, 1, 2, AvmMemoryTag::U64); // 19 * 53 = 1007
        trace_builder.return_op(0, 0);

        trace = trace_builder.finalize();

        // Find the row with multiplication operation and retrieve clk.
        auto row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_mul == FF(1); });

        ASSERT_TRUE(row != trace.end());
        ASSERT_EQ(row->avm_main_ic, 1007); // Sanity check
        auto clk = row->avm_main_clk;

        // Find the corresponding Alu trace row
        auto alu_row =
            std::ranges::find_if(trace.begin(), trace.end(), [clk](Row r) { return r.avm_alu_alu_clk == clk; });
        ASSERT_TRUE(alu_row != trace.end());

        // Find memory trace entry related to storing output (intermediate register Ic) in memory.
        auto mem_row = std::ranges::find_if(trace.begin(), trace.end(), [clk](Row r) {
            return r.avm_mem_m_clk == clk && r.avm_mem_m_op_c == FF(1) && r.avm_mem_m_rw == FF(1);
        });
        ASSERT_TRUE(mem_row != trace.end());

        main_idx = static_cast<size_t>(row - trace.begin());
        alu_idx = static_cast<size_t>(alu_row - trace.begin());
        mem_idx = static_cast<size_t>(mem_row - trace.begin());
    }
};

/******************************************************************************
 *
 *                          INTER-TABLE NEGATIVE TESTS
 *
 ******************************************************************************
 * These negative unit tests aim to catch violations related to inter-table
 * relations. Inter-table relations are implemented through permutation and
 * lookup relations. Each permutation and lookup relation defined in the AVM
 * has to be negatively tested in the current test suite.
 * The built trace in each test needs to be as correct as possible except the
 * relation being tested.
 ******************************************************************************/

TEST_F(AvmPermMainAluNegativeTests, wrongAluOutputCopyInMain)
{
    // Mutate the multiplication output. Note that the output alu counterpart is still valid
    // and pass the multiplication relation.
    trace.at(main_idx).avm_main_ic = 1008;
    trace.at(mem_idx).avm_mem_m_val = 1008;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "PERM_MAIN_ALU");
}

TEST_F(AvmPermMainAluNegativeTests, wrongCopyToAluIaInput)
{
    // Mutate the input of alu_ia and adapt the output ic accordingly.
    trace.at(alu_idx).avm_alu_alu_ia = 20;
    trace.at(alu_idx).avm_alu_alu_ic = 1060;  // 20 * 53; required to pass the alu mul relation
    trace.at(alu_idx).avm_alu_alu_u8_r0 = 36; // 1060 % 256 = 36
    trace.at(alu_idx).avm_alu_alu_u8_r1 = 4;  // 4 * 256 = 1024

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "PERM_MAIN_ALU");
}

TEST_F(AvmPermMainAluNegativeTests, wrongCopyToAluIbInput)
{
    // Mutate the input of alu_ia and adapt the output ic accordingly.
    trace.at(alu_idx).avm_alu_alu_ib = 10;
    trace.at(alu_idx).avm_alu_alu_ic = 190; // 19 * 10; required to pass the alu mul relation
    trace.at(alu_idx).avm_alu_alu_u8_r0 = 190;
    trace.at(alu_idx).avm_alu_alu_u8_r1 = 0;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "PERM_MAIN_ALU");
}

TEST_F(AvmPermMainAluNegativeTests, wrongCopyToAluOpSelector)
{
    trace.at(alu_idx).avm_alu_alu_op_mul = 0;
    trace.at(alu_idx).avm_alu_alu_op_add = 1;
    trace.at(alu_idx).avm_alu_alu_ic = 72; // 19 + 53
    trace.at(alu_idx).avm_alu_alu_u8_r0 = 72;
    trace.at(alu_idx).avm_alu_alu_u8_r1 = 0;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "PERM_MAIN_ALU");
}

TEST_F(AvmPermMainAluNegativeTests, removeAluSelector)
{
    trace.at(alu_idx).avm_alu_alu_sel = 0;
    trace.at(alu_idx).avm_alu_alu_op_mul = 0;

    EXPECT_THROW_WITH_MESSAGE(validate_trace_proof(std::move(trace)), "PERM_MAIN_ALU");
}

} // namespace tests_avm