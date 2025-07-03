#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/gas.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using gas = bb::avm2::gas<FF>;

TEST(GasConstrainingTest, EmptyRow)
{
    check_relation<gas>(testing::empty_trace());
}

TEST(GasConstrainingTest, AllSubrelations)
{
    uint32_t opcode_l2_gas = 100;
    uint32_t addressing_gas = 50;
    uint32_t base_da_gas = 3;
    uint32_t dynamic_l2_gas = 10;
    uint32_t dynamic_da_gas = 5;
    uint32_t dynamic_l2_gas_factor = 2;
    uint32_t dynamic_da_gas_factor = 1;
    uint32_t l2_gas_limit = 1000;
    uint32_t da_gas_limit = 800;
    uint32_t prev_l2_gas_used = 500;
    uint32_t prev_da_gas_used = 200;
    uint64_t limit_used_l2_cmp_diff =
        l2_gas_limit - (prev_l2_gas_used + opcode_l2_gas + addressing_gas + dynamic_l2_gas * dynamic_l2_gas_factor);
    uint64_t limit_used_da_cmp_diff =
        da_gas_limit - (prev_da_gas_used + base_da_gas + dynamic_da_gas * dynamic_da_gas_factor);

    TestTraceContainer trace({ {
        { C::execution_sel_should_check_gas, 1 },
        { C::execution_constant_64, 64 },
        // looked up in execution.pil
        { C::execution_opcode_gas, opcode_l2_gas },
        { C::execution_addressing_gas, addressing_gas },
        { C::execution_base_da_gas, base_da_gas },
        { C::execution_dynamic_l2_gas, dynamic_l2_gas },
        { C::execution_dynamic_da_gas, dynamic_da_gas },
        // event
        { C::execution_l2_gas_limit, l2_gas_limit },
        { C::execution_da_gas_limit, da_gas_limit },
        { C::execution_prev_l2_gas_used, prev_l2_gas_used },
        { C::execution_prev_da_gas_used, prev_da_gas_used },
        { C::execution_dynamic_l2_gas_factor, dynamic_l2_gas_factor },
        { C::execution_dynamic_da_gas_factor, dynamic_da_gas_factor },
        { C::execution_limit_used_l2_cmp_diff, limit_used_l2_cmp_diff },
        { C::execution_limit_used_da_cmp_diff, limit_used_da_cmp_diff },
        // out
        { C::execution_out_of_gas_l2, 0 },
        { C::execution_out_of_gas_da, 0 },
        { C::execution_sel_out_of_gas, 0 },
    } });
    check_relation<gas>(trace);

    // Can't cheat OOG.
    trace.set(0,
              { {
                  { C::execution_out_of_gas_l2, 0 },
                  { C::execution_out_of_gas_da, 0 },
                  { C::execution_sel_out_of_gas, 1 },
              } });
    EXPECT_THROW(check_relation<gas>(trace), std::runtime_error);
    trace.set(0,
              { {
                  { C::execution_out_of_gas_l2, 1 },
                  { C::execution_out_of_gas_da, 1 },
                  { C::execution_sel_out_of_gas, 1 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_L2_CMP_DIFF), "L2_CMP_DIFF");
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_DA_CMP_DIFF), "DA_CMP_DIFF");
}

TEST(GasConstrainingTest, LimitDiffs)
{
    uint32_t opcode_l2_gas = 100;
    uint32_t addressing_gas = 50;
    uint32_t base_da_gas = 3;
    uint32_t dynamic_l2_gas = 10;
    uint32_t dynamic_da_gas = 5;
    uint32_t dynamic_l2_gas_factor = 2;
    uint32_t dynamic_da_gas_factor = 1;
    uint32_t l2_gas_limit = 1000;
    uint32_t da_gas_limit = 800;
    uint32_t prev_l2_gas_used = 500;
    uint32_t prev_da_gas_used = 200;

    TestTraceContainer trace({ {
        { C::execution_sel_should_check_gas, 1 },
        { C::execution_constant_64, 64 },
        // looked up in execution.pil
        { C::execution_opcode_gas, opcode_l2_gas },
        { C::execution_addressing_gas, addressing_gas },
        { C::execution_base_da_gas, base_da_gas },
        { C::execution_dynamic_l2_gas, dynamic_l2_gas },
        { C::execution_dynamic_da_gas, dynamic_da_gas },
        // event
        { C::execution_l2_gas_limit, l2_gas_limit },
        { C::execution_da_gas_limit, da_gas_limit },
        { C::execution_prev_l2_gas_used, prev_l2_gas_used },
        { C::execution_prev_da_gas_used, prev_da_gas_used },
        { C::execution_dynamic_l2_gas_factor, dynamic_l2_gas_factor },
        { C::execution_dynamic_da_gas_factor, dynamic_da_gas_factor },
        { C::execution_limit_used_l2_cmp_diff, 20 }, // Wrong diff.
        { C::execution_limit_used_da_cmp_diff, 30 }, // Wrong diff.
        // out
        { C::execution_out_of_gas_l2, 0 },
        { C::execution_out_of_gas_da, 0 },
        { C::execution_sel_out_of_gas, 0 },
    } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_L2_CMP_DIFF), "L2_CMP_DIFF");
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_DA_CMP_DIFF), "DA_CMP_DIFF");
}

TEST(GasConstrainingTest, OutOfGasBase)
{
    uint32_t opcode_l2_gas = 100;
    uint32_t addressing_gas = 50;
    uint32_t base_da_gas = 100;
    uint32_t dynamic_l2_gas = 0;
    uint32_t dynamic_da_gas = 0;
    uint32_t dynamic_l2_gas_factor = 2;
    uint32_t dynamic_da_gas_factor = 1;
    uint32_t l2_gas_limit = 100;
    uint32_t da_gas_limit = 80;
    uint32_t prev_l2_gas_used = 0;
    uint32_t prev_da_gas_used = 0;
    uint64_t limit_used_l2_cmp_diff =
        (prev_l2_gas_used + opcode_l2_gas + addressing_gas + dynamic_l2_gas * dynamic_l2_gas_factor) - l2_gas_limit - 1;
    uint64_t limit_used_da_cmp_diff =
        (prev_da_gas_used + base_da_gas + dynamic_da_gas * dynamic_da_gas_factor) - da_gas_limit - 1;

    TestTraceContainer trace({ {
        { C::execution_sel_should_check_gas, 1 },
        { C::execution_constant_64, 64 },
        // looked up in execution.pil
        { C::execution_opcode_gas, opcode_l2_gas },
        { C::execution_addressing_gas, addressing_gas },
        { C::execution_base_da_gas, base_da_gas },
        { C::execution_dynamic_l2_gas, dynamic_l2_gas },
        { C::execution_dynamic_da_gas, dynamic_da_gas },
        // event
        { C::execution_l2_gas_limit, l2_gas_limit },
        { C::execution_da_gas_limit, da_gas_limit },
        { C::execution_prev_l2_gas_used, prev_l2_gas_used },
        { C::execution_prev_da_gas_used, prev_da_gas_used },
        { C::execution_dynamic_l2_gas_factor, dynamic_l2_gas_factor },
        { C::execution_dynamic_da_gas_factor, dynamic_da_gas_factor },
        { C::execution_limit_used_l2_cmp_diff, limit_used_l2_cmp_diff },
        { C::execution_limit_used_da_cmp_diff, limit_used_da_cmp_diff },
        // out
        { C::execution_out_of_gas_l2, 1 },
        { C::execution_out_of_gas_da, 1 },
        { C::execution_sel_out_of_gas, 1 },
    } });
    check_relation<gas>(trace);

    // Can't cheat OOG.
    trace.set(0,
              { {
                  { C::execution_out_of_gas_l2, 0 },
                  { C::execution_out_of_gas_da, 0 },
                  { C::execution_sel_out_of_gas, 0 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_L2_CMP_DIFF), "L2_CMP_DIFF");
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_DA_CMP_DIFF), "DA_CMP_DIFF");
}

TEST(GasConstrainingTest, OutOfGasDynamic)
{
    uint32_t opcode_l2_gas = 1;
    uint32_t addressing_gas = 0;
    uint32_t base_da_gas = 3;
    uint32_t dynamic_l2_gas = 10;
    uint32_t dynamic_da_gas = 9;
    uint32_t dynamic_l2_gas_factor = 10;
    uint32_t dynamic_da_gas_factor = 10;
    uint32_t l2_gas_limit = 100;
    uint32_t da_gas_limit = 80;
    uint32_t prev_l2_gas_used = 0;
    uint32_t prev_da_gas_used = 0;
    uint64_t limit_used_l2_cmp_diff =
        (prev_l2_gas_used + opcode_l2_gas + addressing_gas + dynamic_l2_gas * dynamic_l2_gas_factor) - l2_gas_limit - 1;
    uint64_t limit_used_da_cmp_diff =
        (prev_da_gas_used + base_da_gas + dynamic_da_gas * dynamic_da_gas_factor) - da_gas_limit - 1;

    TestTraceContainer trace({ {
        { C::execution_sel_should_check_gas, 1 },
        { C::execution_constant_64, 64 },
        // looked up in execution.pil
        { C::execution_opcode_gas, opcode_l2_gas },
        { C::execution_addressing_gas, addressing_gas },
        { C::execution_base_da_gas, base_da_gas },
        { C::execution_dynamic_l2_gas, dynamic_l2_gas },
        { C::execution_dynamic_da_gas, dynamic_da_gas },
        // event
        { C::execution_l2_gas_limit, l2_gas_limit },
        { C::execution_da_gas_limit, da_gas_limit },
        { C::execution_prev_l2_gas_used, prev_l2_gas_used },
        { C::execution_prev_da_gas_used, prev_da_gas_used },
        { C::execution_dynamic_l2_gas_factor, dynamic_l2_gas_factor },
        { C::execution_dynamic_da_gas_factor, dynamic_da_gas_factor },
        { C::execution_limit_used_l2_cmp_diff, limit_used_l2_cmp_diff },
        { C::execution_limit_used_da_cmp_diff, limit_used_da_cmp_diff },
        // out
        { C::execution_out_of_gas_l2, 1 },
        { C::execution_out_of_gas_da, 1 },
        { C::execution_sel_out_of_gas, 1 },
    } });
    check_relation<gas>(trace);

    // Can't cheat OOG.
    trace.set(0,
              { {
                  { C::execution_out_of_gas_l2, 0 },
                  { C::execution_out_of_gas_da, 0 },
                  { C::execution_sel_out_of_gas, 0 },
              } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_L2_CMP_DIFF), "L2_CMP_DIFF");
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_DA_CMP_DIFF), "DA_CMP_DIFF");
}

TEST(GasConstrainingTest, NoCheckNoOOG)
{
    TestTraceContainer trace({ {
        { C::execution_sel_should_check_gas, 0 },
        // out
        { C::execution_out_of_gas_l2, 0 },
        { C::execution_out_of_gas_da, 0 },
        { C::execution_sel_out_of_gas, 0 },
    } });
    check_relation<gas>(trace);

    // Can't cheat OOG.
    trace.set(0,
              { {
                  { C::execution_out_of_gas_l2, 1 },
                  { C::execution_out_of_gas_da, 1 },
                  { C::execution_sel_out_of_gas, 1 },
              } });
    EXPECT_THROW(check_relation<gas>(trace), std::runtime_error);
}

TEST(GasConstrainingTest, DynGasFactorBitwise)
{
    PrecomputedTraceBuilder precomputed_builder;
    TestTraceContainer trace({
        {
            { C::execution_sel, 1 },
            { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(ValueTag::U16) },
            { C::execution_sel_bitwise, 1 },
            { C::execution_dynamic_l2_gas_factor, get_tag_bytes(ValueTag::U16) },
        },
    });

    precomputed_builder.process_tag_parameters(trace);
    precomputed_builder.process_misc(trace, 7); // Need at least clk values from 0-6 for the lookup
    check_interaction<ExecutionTraceBuilder, lookup_execution_dyn_l2_factor_bitwise_settings>(trace);

    trace.set(C::execution_dynamic_l2_gas_factor, 0, 100); // Set to some random value that can't be looked up
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<tracegen::ExecutionTraceBuilder, lookup_execution_dyn_l2_factor_bitwise_settings>(trace)),
        "Failed.*EXECUTION_DYN_L2_FACTOR_BITWISE. Could not find tuple in destination.");
}

} // namespace
} // namespace bb::avm2::constraining
