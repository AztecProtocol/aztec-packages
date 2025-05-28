#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using tx = bb::avm2::tx<FF>;

TEST(TxExecutionConstrainingTest, Basic)
{
    // clang-format off
    TestTraceContainer trace({
         {{ C::execution_sel, 1 }, { C::execution_pc, 0 }},
         {{ C::execution_sel, 1 }, { C::execution_pc, 20 }, { C::execution_last, 1 }}
    });
    // clang-format on

    check_relation<tx>(trace);
}

TEST(TxExecutionConstrainingTest, ReadPhase)
{
    auto test_public_inputs = testing::PublicInputsBuilder()
                                  .rand_public_setup_call_requests(1)
                                  .rand_public_app_logic_call_requests(1)
                                  .build();

    TestTraceContainer trace({
        // Row 0
        { { C::tx_sel, 1 }, { C::precomputed_clk, 0 }, { C::precomputed_first_row, 1 } },

        // Row 1
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION) },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 2
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NULLIFIER_INSERTION) },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 3
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_L2_TO_L1_MESSAGE) },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 4
        // Setup
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
          { C::tx_start_phase, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX },
          { C::tx_remaining_phase_events, 1 } },
        // Row 5
        { { C::tx_sel, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX + 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
          { C::tx_end_phase, 1 } },

        // Row 6
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NOTE_INSERTION) },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 7
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NULLIFIER_INSERTION) },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 8
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_L2_TO_L1_MESSAGE) },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // App Logic
        // Row 9
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::APP_LOGIC) },
          { C::tx_start_phase, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX },
          { C::tx_remaining_phase_events, 1 } },
        // Row 10
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::APP_LOGIC) },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX + 1 },
          { C::tx_end_phase, 1 } },

        // Row 11
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::TEARDOWN) },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },
    });

    tracegen::PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    check_relation<tx>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
