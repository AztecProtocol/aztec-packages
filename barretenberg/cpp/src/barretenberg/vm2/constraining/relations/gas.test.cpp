#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/gas.hpp"
#include "barretenberg/vm2/generated/relations/lookups_execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_gas.hpp"
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
using execution = bb::avm2::execution<FF>;

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
    uint64_t total_gas_l2 =
        prev_l2_gas_used + opcode_l2_gas + addressing_gas + (dynamic_l2_gas * dynamic_l2_gas_factor);
    uint64_t total_gas_da = prev_da_gas_used + base_da_gas + (dynamic_da_gas * dynamic_da_gas_factor);

    TestTraceContainer trace({ {
        { C::execution_sel_should_check_gas, 1 },
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
        // Derived cumulative gas used.
        { C::execution_total_gas_l2, total_gas_l2 },
        { C::execution_total_gas_da, total_gas_da },
        // out
        { C::execution_out_of_gas_l2, 0 },
        { C::execution_out_of_gas_da, 0 },
        { C::execution_sel_out_of_gas, 0 },
    } });

    // Add GT lookup values
    // L2 gas
    trace.set(0,
              { {
                  { C::gt_sel, 1 },
                  { C::gt_input_a, total_gas_l2 },
                  { C::gt_input_b, l2_gas_limit },
                  { C::gt_res, 0 },
              } });
    // DA gas
    trace.set(1,
              { {
                  { C::gt_sel, 1 },
                  { C::gt_input_a, total_gas_da },
                  { C::gt_input_b, da_gas_limit },
                  { C::gt_res, 0 },
              } });

    check_relation<gas>(trace);
    check_interaction<ExecutionTraceBuilder,
                      lookup_gas_is_out_of_gas_l2_settings,
                      lookup_gas_is_out_of_gas_da_settings>(trace);

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
    EXPECT_THROW_WITH_MESSAGE((check_interaction<ExecutionTraceBuilder, lookup_gas_is_out_of_gas_l2_settings>(trace)),
                              "Failed.*LOOKUP_GAS_IS_OUT_OF_GAS_L2. Could not find tuple in destination.");
    EXPECT_THROW_WITH_MESSAGE((check_interaction<ExecutionTraceBuilder, lookup_gas_is_out_of_gas_da_settings>(trace)),
                              "Failed.*LOOKUP_GAS_IS_OUT_OF_GAS_DA. Could not find tuple in destination.");
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
    uint64_t total_gas_l2 =
        prev_l2_gas_used + opcode_l2_gas + addressing_gas + (dynamic_l2_gas * dynamic_l2_gas_factor);
    uint64_t total_gas_da = prev_da_gas_used + base_da_gas + (dynamic_da_gas * dynamic_da_gas_factor);

    TestTraceContainer trace({ {
        { C::execution_sel_should_check_gas, 1 },
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
        // Derived cumulative gas used.
        { C::execution_total_gas_l2, total_gas_l2 },
        { C::execution_total_gas_da, total_gas_da },
        // out
        { C::execution_out_of_gas_l2, 1 },
        { C::execution_out_of_gas_da, 1 },
        { C::execution_sel_out_of_gas, 1 },
    } });

    // Add GT lookup values
    // L2 gas
    trace.set(0,
              { {
                  { C::gt_sel, 1 },
                  { C::gt_input_a, total_gas_l2 },
                  { C::gt_input_b, l2_gas_limit },
                  { C::gt_res, 1 },
              } });
    // DA gas
    trace.set(1,
              { {
                  { C::gt_sel, 1 },
                  { C::gt_input_a, total_gas_da },
                  { C::gt_input_b, da_gas_limit },
                  { C::gt_res, 1 },
              } });

    check_relation<gas>(trace);
    check_interaction<ExecutionTraceBuilder,
                      lookup_gas_is_out_of_gas_l2_settings,
                      lookup_gas_is_out_of_gas_da_settings>(trace);

    // Can't cheat OOG.
    trace.set(0,
              { {
                  { C::execution_out_of_gas_l2, 0 },
                  { C::execution_out_of_gas_da, 0 },
                  { C::execution_sel_out_of_gas, 0 },
              } });

    EXPECT_THROW_WITH_MESSAGE((check_interaction<ExecutionTraceBuilder, lookup_gas_is_out_of_gas_l2_settings>(trace)),
                              "Failed.*LOOKUP_GAS_IS_OUT_OF_GAS_L2. Could not find tuple in destination.");
    EXPECT_THROW_WITH_MESSAGE((check_interaction<ExecutionTraceBuilder, lookup_gas_is_out_of_gas_da_settings>(trace)),
                              "Failed.*LOOKUP_GAS_IS_OUT_OF_GAS_DA. Could not find tuple in destination.");
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
    uint64_t total_gas_l2 =
        prev_l2_gas_used + opcode_l2_gas + addressing_gas + (dynamic_l2_gas * dynamic_l2_gas_factor);
    uint64_t total_gas_da = prev_da_gas_used + base_da_gas + (dynamic_da_gas * dynamic_da_gas_factor);

    TestTraceContainer trace({ {
        { C::execution_sel_should_check_gas, 1 },
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
        // Derived cumulative gas used.
        { C::execution_total_gas_l2, total_gas_l2 },
        { C::execution_total_gas_da, total_gas_da },
        // out
        { C::execution_out_of_gas_l2, 1 },
        { C::execution_out_of_gas_da, 1 },
        { C::execution_sel_out_of_gas, 1 },
    } });

    // Add GT lookup values
    // L2 gas
    trace.set(0,
              { {
                  { C::gt_sel, 1 },
                  { C::gt_input_a, total_gas_l2 },
                  { C::gt_input_b, l2_gas_limit },
                  { C::gt_res, 1 },
              } });
    // DA gas
    trace.set(1,
              { {
                  { C::gt_sel, 1 },
                  { C::gt_input_a, total_gas_da },
                  { C::gt_input_b, da_gas_limit },
                  { C::gt_res, 1 },
              } });
    check_relation<gas>(trace);
    check_interaction<ExecutionTraceBuilder,
                      lookup_gas_is_out_of_gas_l2_settings,
                      lookup_gas_is_out_of_gas_da_settings>(trace);

    // Can't cheat OOG.
    trace.set(0,
              { {
                  { C::execution_out_of_gas_l2, 0 },
                  { C::execution_out_of_gas_da, 0 },
                  { C::execution_sel_out_of_gas, 0 },
              } });
    EXPECT_THROW_WITH_MESSAGE((check_interaction<ExecutionTraceBuilder, lookup_gas_is_out_of_gas_l2_settings>(trace)),
                              "Failed.*LOOKUP_GAS_IS_OUT_OF_GAS_L2. Could not find tuple in destination.");
    EXPECT_THROW_WITH_MESSAGE((check_interaction<ExecutionTraceBuilder, lookup_gas_is_out_of_gas_da_settings>(trace)),
                              "Failed.*LOOKUP_GAS_IS_OUT_OF_GAS_DA. Could not find tuple in destination.");
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
            { C::execution_sel_gas_bitwise, 1 },
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

TEST(GasConstrainingTest, DynGasFactorToRadix)
{
    PrecomputedTraceBuilder precomputed_builder;

    uint32_t radix = 10;
    uint32_t num_limbs = 20;
    uint32_t num_p_limbs = static_cast<uint32_t>(get_p_limbs_per_radix_size(radix));
    TestTraceContainer trace(
        { {
              { C::execution_sel, 1 },
              { C::execution_register_1_, radix },
              { C::execution_register_2_, num_limbs },
              { C::execution_sel_should_check_gas, 1 },
              // To Radix BE Dynamic Gas
              { C::execution_sel_gas_to_radix, 1 },
              { C::execution_dyn_gas_id, AVM_DYN_GAS_ID_TORADIX },
              { C::execution_two_five_six, 256 },
              { C::execution_sel_radix_gt_256, 0 },
              { C::execution_sel_lookup_num_p_limbs, 1 },
              { C::execution_num_p_limbs, num_p_limbs },
              { C::execution_sel_use_num_limbs, num_limbs > num_p_limbs ? 1 : 0 },
              { C::execution_dynamic_l2_gas_factor, num_limbs > num_p_limbs ? num_limbs : num_p_limbs },
              // GT Trace, used to check if radix > 256
              { C::gt_sel, 1 },
              { C::gt_input_a, radix },
              { C::gt_input_b, 256 },
              { C::gt_res, 0 },
          },
          {
              // Gt Trace, compare num_limbs > num_p_limbs
              { C::gt_sel, 1 },
              { C::gt_input_a, num_limbs },
              { C::gt_input_b, num_p_limbs },
              { C::gt_res, num_limbs > num_p_limbs ? 1 : 0 },
          } });

    precomputed_builder.process_misc(trace, 257);
    precomputed_builder.process_to_radix_safe_limbs(trace);

    check_interaction<ExecutionTraceBuilder,
                      lookup_execution_check_radix_gt_256_settings,
                      lookup_execution_get_p_limbs_settings,
                      lookup_execution_get_max_limbs_settings>(trace);
    check_relation<execution>(trace, execution::SR_DYN_L2_FACTOR_TO_RADIX_BE, execution::SR_DYN_GAS_ID_DECOMPOSITION);

    trace.set(C::execution_dynamic_l2_gas_factor, 0, 100); // Set to some random value is incorrect
    EXPECT_THROW_WITH_MESSAGE((check_relation<execution>(trace, execution::SR_DYN_L2_FACTOR_TO_RADIX_BE)),
                              ".*subrelation DYN_L2_FACTOR_TO_RADIX_BE failed.*");
}

TEST(GasConstrainingTest, DynGasFactorInvalidRadix)
{
    PrecomputedTraceBuilder precomputed_builder;

    uint32_t radix = 1000;
    uint32_t num_limbs = 20;
    uint32_t num_p_limbs = 32; // When radix > 256, we set num_p_limbs to 32.
    TestTraceContainer trace(
        { {
              { C::execution_sel, 1 },
              { C::execution_register_1_, radix },
              { C::execution_register_2_, num_limbs },
              { C::execution_sel_should_check_gas, 1 },
              // To Radix BE Dynamic Gas
              { C::execution_sel_gas_to_radix, 1 },
              { C::execution_dyn_gas_id, AVM_DYN_GAS_ID_TORADIX },
              { C::execution_two_five_six, 256 },
              { C::execution_sel_radix_gt_256, radix > 256 ? 1 : 0 },
              { C::execution_sel_lookup_num_p_limbs, radix <= 256 ? 1 : 0 },
              { C::execution_num_p_limbs, num_p_limbs },
              { C::execution_sel_use_num_limbs, num_limbs > num_p_limbs ? 1 : 0 },
              { C::execution_dynamic_l2_gas_factor, num_limbs > num_p_limbs ? num_limbs : num_p_limbs },
              // GT Trace, used to check if radix > 256
              { C::gt_sel, 1 },
              { C::gt_input_a, radix },
              { C::gt_input_b, 256 },
              { C::gt_res, radix > 256 ? 1 : 0 },
          },
          {
              // Gt Trace, compare num_limbs > num_p_limbs
              { C::gt_sel, 1 },
              { C::gt_input_a, num_limbs },
              { C::gt_input_b, num_p_limbs },
              { C::gt_res, num_limbs > num_p_limbs ? 1 : 0 },
          } });

    precomputed_builder.process_misc(trace, 257);
    precomputed_builder.process_to_radix_safe_limbs(trace);

    check_interaction<ExecutionTraceBuilder,
                      lookup_execution_check_radix_gt_256_settings,
                      lookup_execution_get_p_limbs_settings,
                      lookup_execution_get_max_limbs_settings>(trace);
    check_relation<execution>(trace,
                              execution::SR_NUM_P_LIMBS_CEIL,
                              execution::SR_DYN_L2_FACTOR_TO_RADIX_BE,
                              execution::SR_DYN_GAS_ID_DECOMPOSITION);
}

} // namespace
} // namespace bb::avm2::constraining
