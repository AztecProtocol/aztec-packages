#include "barretenberg/vm2/tracegen/tx_trace.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using enum ::bb::avm2::WireOpCode;

using ::testing::AllOf;

TEST(TxTraceGenTest, EnqueuedCallEvent)
{
    TestTraceContainer trace;
    TxTraceBuilder builder;

    auto msg_sender = FF::random_element();
    auto contract_address = FF::random_element();
    auto calldata_hash = FF::random_element();

    simulation::TxStartupEvent startup_event = {
        .tx_gas_limit = { 1000, 2000 },
        .private_gas_used = { 500, 1000 },
        .tree_state = {},
    };

    simulation::TxPhaseEvent tx_event = {
        .phase = TransactionPhase::SETUP,
        .prev_tree_state = {},
        .next_tree_state = {},
        .reverted = false,
        .event =
            simulation::EnqueuedCallEvent{
                .msg_sender = msg_sender,
                .contract_address = contract_address,
                .is_static = false,
                .calldata_hash = calldata_hash,
                .prev_gas_used = {},
                .gas_used = {},
                .gas_limit = {},
                .success = true,
            },
    };

    builder.process({ startup_event, tx_event }, trace);
    auto rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 11); // 10 tx trace rows + 1 precomputed row
    EXPECT_THAT(rows[static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION)],
                AllOf(ROW_FIELD_EQ(tx_sel, 1),
                      ROW_FIELD_EQ(tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION)),
                      ROW_FIELD_EQ(tx_is_padded, 1),
                      ROW_FIELD_EQ(tx_is_tree_insert_phase, 1),
                      ROW_FIELD_EQ(tx_sel_non_revertible_append_note_hash, 1),
                      ROW_FIELD_EQ(
                          tx_read_pi_length_offset,
                          AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX),
                      ROW_FIELD_EQ(tx_read_pi_offset,
                                   AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX),
                      ROW_FIELD_EQ(tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX),
                      ROW_FIELD_EQ(tx_start_phase, 1),
                      ROW_FIELD_EQ(tx_end_phase, 1),
                      ROW_FIELD_EQ(tx_is_static, false)));

    // Setup
    EXPECT_THAT(rows[static_cast<uint8_t>(TransactionPhase::SETUP)],
                AllOf(ROW_FIELD_EQ(tx_sel, 1),
                      ROW_FIELD_EQ(tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP)),
                      ROW_FIELD_EQ(tx_start_phase, 1),
                      ROW_FIELD_EQ(tx_is_public_call_request, 1),
                      ROW_FIELD_EQ(tx_read_pi_length_offset,
                                   AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX),
                      ROW_FIELD_EQ(tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX),
                      ROW_FIELD_EQ(tx_remaining_phase_counter, 1),
                      ROW_FIELD_EQ(tx_remaining_phase_inv, 1),
                      ROW_FIELD_EQ(tx_msg_sender, msg_sender),
                      ROW_FIELD_EQ(tx_contract_addr, contract_address),
                      ROW_FIELD_EQ(tx_calldata_hash, calldata_hash),
                      ROW_FIELD_EQ(tx_end_phase, 1)));
};

TEST(TxTraceGenTest, CollectFeeEvent)
{
    TestTraceContainer trace;
    TxTraceBuilder builder;

    auto fee_payer = FF::random_element();
    auto fee_payer_balance = FF::neg_one();
    auto effective_fee_per_da_gas = 100;
    auto effective_fee_per_l2_gas = 200;
    auto prev_da_gas_used = 1000;
    auto prev_l2_gas_used = 500;
    auto fee = effective_fee_per_da_gas * prev_da_gas_used + effective_fee_per_l2_gas * prev_l2_gas_used;

    simulation::TxStartupEvent startup_event = {
        .tx_gas_limit = { 1000, 2000 },
        .private_gas_used = { 500, 1000 },
        .tree_state = {},
    };

    simulation::TxPhaseEvent tx_event = { .phase = TransactionPhase::COLLECT_GAS_FEES,
                                          .prev_tree_state = {},
                                          .next_tree_state = {},
                                          .reverted = false,
                                          .event = simulation::CollectGasFeeEvent{
                                              .effective_fee_per_da_gas =
                                                  static_cast<uint128_t>(effective_fee_per_da_gas),
                                              .effective_fee_per_l2_gas =
                                                  static_cast<uint128_t>(effective_fee_per_l2_gas),
                                              .fee_payer = fee_payer,
                                              .fee_payer_balance = fee_payer_balance,
                                              .fee = fee,
                                          } };

    builder.process({ startup_event, tx_event }, trace);
    auto rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 11); // 10 tx trace rows + 1 precomputed row

    EXPECT_THAT(rows[static_cast<uint8_t>(TransactionPhase::COLLECT_GAS_FEES)],
                AllOf(ROW_FIELD_EQ(tx_sel, 1),
                      ROW_FIELD_EQ(tx_phase_value, static_cast<uint8_t>(TransactionPhase::COLLECT_GAS_FEES)),
                      ROW_FIELD_EQ(tx_is_padded, 0),
                      ROW_FIELD_EQ(tx_start_phase, 1),
                      ROW_FIELD_EQ(tx_sel_read_phase_length, 0),
                      ROW_FIELD_EQ(tx_end_phase, 1),
                      ROW_FIELD_EQ(tx_prev_da_gas_used, prev_da_gas_used),
                      ROW_FIELD_EQ(tx_prev_l2_gas_used, prev_l2_gas_used),
                      ROW_FIELD_EQ(tx_read_pi_offset, AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX),
                      ROW_FIELD_EQ(tx_read_pi_length_offset, 0),
                      ROW_FIELD_EQ(tx_write_pi_offset, AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX),
                      ROW_FIELD_EQ(tx_remaining_phase_counter, 1),
                      ROW_FIELD_EQ(tx_remaining_phase_inv, FF(1).invert()),
                      ROW_FIELD_EQ(tx_remaining_phase_minus_one_inv, 0),
                      ROW_FIELD_EQ(tx_is_collect_fee, 1),
                      ROW_FIELD_EQ(tx_effective_fee_per_da_gas, FF(effective_fee_per_da_gas)),
                      ROW_FIELD_EQ(tx_effective_fee_per_l2_gas, FF(effective_fee_per_l2_gas)),
                      ROW_FIELD_EQ(tx_fee_payer, fee_payer),
                      ROW_FIELD_EQ(tx_fee_payer_pi_offset, AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX),
                      ROW_FIELD_EQ(tx_fee, fee),
                      ROW_FIELD_EQ(tx_fee_payer_balance, fee_payer_balance),
                      ROW_FIELD_EQ(tx_end_gas_used_pi_offset, AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX),
                      ROW_FIELD_EQ(tx_next_da_gas_used, prev_da_gas_used),
                      ROW_FIELD_EQ(tx_next_l2_gas_used, prev_l2_gas_used)));
};

} // namespace
} // namespace bb::avm2::tracegen
