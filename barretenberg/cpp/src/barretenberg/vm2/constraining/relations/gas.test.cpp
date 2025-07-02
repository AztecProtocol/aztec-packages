#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/gas.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using gas = bb::avm2::gas<FF>;

TEST(GasConstrainingTest, EmptyRow)
{
    check_relation<gas>(testing::empty_trace());
}

TEST(GasConstrainingTest, GasUsedContinuity)
{
    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } },
                               {
                                   // First Row of execution
                                   { C::execution_sel, 1 },
                                   { C::execution_l2_gas_used, 100 },
                                   { C::execution_da_gas_used, 200 },
                               },
                               {
                                   // CALL
                                   { C::execution_sel, 1 },
                                   { C::execution_sel_enter_call, 1 },
                                   { C::execution_l2_gas_used, 110 },
                                   { C::execution_da_gas_used, 200 },
                                   { C::execution_prev_l2_gas_used, 100 },
                                   { C::execution_prev_da_gas_used, 200 },
                               },
                               {
                                   // Return
                                   { C::execution_sel, 1 },
                                   { C::execution_sel_exit_call, 1 },
                                   { C::execution_nested_exit_call, 1 },
                                   { C::execution_l2_gas_used, 50 },
                                   { C::execution_da_gas_used, 60 },
                                   { C::execution_parent_l2_gas_used, 110 },
                                   { C::execution_parent_da_gas_used, 200 },
                                   { C::execution_prev_l2_gas_used, 0 },
                                   { C::execution_prev_da_gas_used, 0 },
                               },
                               {
                                   // After return
                                   { C::execution_sel, 1 },
                                   { C::execution_l2_gas_used, 170 },
                                   { C::execution_da_gas_used, 260 },
                                   { C::execution_prev_l2_gas_used, 160 }, // 110 + 50
                                   { C::execution_prev_da_gas_used, 260 }, // 200 + 60
                               },
                               {
                                   { C::execution_sel, 0 },
                                   { C::execution_last, 1 },
                               } });

    check_relation<gas>(trace,
                        gas::SR_L2_GAS_USED_CONTINUITY,
                        gas::SR_L2_GAS_USED_ZERO_AFTER_CALL,
                        gas::SR_L2_GAS_USED_INGEST_AFTER_EXIT,
                        gas::SR_DA_GAS_USED_CONTINUITY,
                        gas::SR_DA_GAS_USED_ZERO_AFTER_CALL,
                        gas::SR_DA_GAS_USED_INGEST_AFTER_EXIT);

    // Negative test: after return, ingest a wrong value
    trace.set(C::execution_prev_l2_gas_used, 4, 110);

    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_L2_GAS_USED_INGEST_AFTER_EXIT),
                              "L2_GAS_USED_INGEST_AFTER_EXIT");

    trace.set(C::execution_prev_da_gas_used, 4, 60);
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_DA_GAS_USED_INGEST_AFTER_EXIT),
                              "DA_GAS_USED_INGEST_AFTER_EXIT");

    // Negative test: inside a nested call, start with non-zero gas used
    trace.set(C::execution_prev_l2_gas_used, 3, 110);
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_L2_GAS_USED_ZERO_AFTER_CALL),
                              "L2_GAS_USED_ZERO_AFTER_CALL");

    trace.set(C::execution_prev_da_gas_used, 3, 200);
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_DA_GAS_USED_ZERO_AFTER_CALL),
                              "DA_GAS_USED_ZERO_AFTER_CALL");

    // Negative test: when no calls are made, prev gas used should be gas used of the previous row
    trace.set(C::execution_prev_l2_gas_used, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_L2_GAS_USED_CONTINUITY), "L2_GAS_USED_CONTINUITY");

    trace.set(C::execution_prev_da_gas_used, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<gas>(trace, gas::SR_DA_GAS_USED_CONTINUITY), "DA_GAS_USED_CONTINUITY");
}

} // namespace
} // namespace bb::avm2::constraining
