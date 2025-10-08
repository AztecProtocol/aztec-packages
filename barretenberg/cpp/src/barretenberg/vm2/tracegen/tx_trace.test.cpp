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
        .state = { .gas_used = { 500, 1000 }, .tree_states = {}, .written_public_data_slots_tree_snapshot = {} },
        .gas_limit = { 1000, 2000 },
        .teardown_gas_limit = { 0, 0 },
        .phase_lengths = { .setup = 1 },
    };

    simulation::TxPhaseEvent tx_event = {
        .phase = TransactionPhase::SETUP,
        .state_before = {},
        .state_after = {},
        .reverted = false,
        .event =
            simulation::EnqueuedCallEvent{
                .msg_sender = msg_sender,
                .contract_address = contract_address,
                .is_static = false,
                .calldata_size = 2,
                .calldata_hash = calldata_hash,
                .success = true,
            },
    };

    builder.process({ startup_event, tx_event }, trace);
    auto rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 2); // 0th precomputed, setup

    // Setup
    EXPECT_THAT(rows[1],
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
                      ROW_FIELD_EQ(tx_calldata_size, 2),
                      ROW_FIELD_EQ(tx_calldata_hash, calldata_hash),
                      ROW_FIELD_EQ(tx_end_phase, 1),
                      ROW_FIELD_EQ(tx_is_static, false)));
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
        .state = { .gas_used = { 500, 1000 }, .tree_states = {}, .written_public_data_slots_tree_snapshot = {} },
        .gas_limit = { 1000, 2000 },
        .teardown_gas_limit = { 0, 0 },
    };

    simulation::TxPhaseEvent tx_event = { .phase = TransactionPhase::COLLECT_GAS_FEES,
                                          .state_before = {},
                                          .state_after = {},
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
    ASSERT_EQ(rows.size(), 2); // 0th precomputed, collect-gas-fees

    EXPECT_THAT(rows[1],
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
                      ROW_FIELD_EQ(tx_next_da_gas_used, prev_da_gas_used),
                      ROW_FIELD_EQ(tx_next_l2_gas_used, prev_l2_gas_used),
                      ROW_FIELD_EQ(tx_uint32_max, 0xffffffff)));
};

TEST(TxTraceGenTest, PadTreesEvent)
{
    TestTraceContainer trace;
    TxTraceBuilder builder;

    simulation::TxStartupEvent startup_event = {
        .state = { .gas_used = { 500, 1000 }, .tree_states = {}, .written_public_data_slots_tree_snapshot = {} },
        .gas_limit = { 1000, 2000 },
        .teardown_gas_limit = { 0, 0 },
    };

    simulation::TxPhaseEvent tx_event = { .phase = TransactionPhase::TREE_PADDING,
                                          .state_before = {
                                            .tree_states = {
                                                .noteHashTree = {
                                                    .tree = {
                                                        .root = 27,
                                                        .nextAvailableLeafIndex = 65,
                                                    },
                                                    .counter = 1
                                                },
                                                .nullifierTree = {
                                                    .tree = {
                                                        .root = 28,
                                                        .nextAvailableLeafIndex = 127,
                                                    },
                                                    .counter = 63
                                                },
                                            },
                                          },
                                          .state_after = {
                                            .tree_states = {
                                                .noteHashTree = {
                                                    .tree = {
                                                        .root = 27,
                                                        .nextAvailableLeafIndex = 128,
                                                    },
                                                    .counter = 1
                                                },
                                                .nullifierTree = {
                                                    .tree = {
                                                        .root = 28,
                                                        .nextAvailableLeafIndex = 128,
                                                    },
                                                    .counter = 63
                                                },
                                            },
                                          },
                                          .reverted = false,
                                          .event = simulation::PadTreesEvent{} };

    builder.process({ startup_event, tx_event }, trace);
    auto rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 2); // 0th precomputed, tree-padding

    EXPECT_THAT(rows[1],
                AllOf(ROW_FIELD_EQ(tx_sel, 1),
                      ROW_FIELD_EQ(tx_phase_value, static_cast<uint8_t>(TransactionPhase::TREE_PADDING)),
                      ROW_FIELD_EQ(tx_start_phase, 1),
                      ROW_FIELD_EQ(tx_end_phase, 1),
                      ROW_FIELD_EQ(tx_is_tree_padding, 1),
                      ROW_FIELD_EQ(tx_remaining_phase_counter, 1),
                      ROW_FIELD_EQ(tx_remaining_phase_inv, 1),
                      ROW_FIELD_EQ(tx_sel_can_emit_note_hash, 1),
                      ROW_FIELD_EQ(tx_sel_can_emit_nullifier, 1),
                      ROW_FIELD_EQ(tx_prev_note_hash_tree_root, 27),
                      ROW_FIELD_EQ(tx_prev_note_hash_tree_size, 65),
                      ROW_FIELD_EQ(tx_prev_num_note_hashes_emitted, 1),
                      ROW_FIELD_EQ(tx_next_note_hash_tree_root, 27),
                      ROW_FIELD_EQ(tx_next_note_hash_tree_size, 128),
                      ROW_FIELD_EQ(tx_prev_nullifier_tree_root, 28),
                      ROW_FIELD_EQ(tx_prev_nullifier_tree_size, 127),
                      ROW_FIELD_EQ(tx_prev_num_nullifiers_emitted, 63),
                      ROW_FIELD_EQ(tx_next_nullifier_tree_root, 28),
                      ROW_FIELD_EQ(tx_next_nullifier_tree_size, 128)));
}

TEST(TxTraceGenTest, CleanupEvent)
{
    TestTraceContainer trace;
    TxTraceBuilder builder;

    simulation::TxStartupEvent startup_event = {
        .state = { .gas_used = { 500, 1000 }, .tree_states = {}, .written_public_data_slots_tree_snapshot = {} },
        .gas_limit = { 1000, 2000 },
        .teardown_gas_limit = { 0, 0 },
    };

    simulation::TxPhaseEvent tx_event = { .phase = TransactionPhase::CLEANUP,
                                          .state_before = {},
                                          .state_after = {},
                                          .reverted = false,
                                          .event = simulation::CleanupEvent{} };

    builder.process({ startup_event, tx_event }, trace);
    auto rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 2); // 0th precomputed, cleanup

    EXPECT_THAT(
        rows[1],
        AllOf(ROW_FIELD_EQ(tx_sel, 1),
              ROW_FIELD_EQ(tx_phase_value, static_cast<uint8_t>(TransactionPhase::CLEANUP)),
              ROW_FIELD_EQ(tx_start_phase, 1),
              ROW_FIELD_EQ(tx_end_phase, 1),
              ROW_FIELD_EQ(tx_is_cleanup, 1),
              ROW_FIELD_EQ(tx_remaining_phase_counter, 1),
              ROW_FIELD_EQ(tx_remaining_phase_inv, 1),
              ROW_FIELD_EQ(tx_note_hash_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX),
              ROW_FIELD_EQ(tx_should_read_note_hash_tree, 1),
              ROW_FIELD_EQ(tx_nullifier_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX),
              ROW_FIELD_EQ(tx_should_read_nullifier_tree, 1),
              ROW_FIELD_EQ(tx_public_data_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX),
              ROW_FIELD_EQ(tx_should_read_public_data_tree, 1),
              ROW_FIELD_EQ(tx_l1_l2_pi_offset, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX),
              ROW_FIELD_EQ(tx_should_read_l1_l2_tree, 1),
              ROW_FIELD_EQ(tx_gas_used_pi_offset, AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX),
              ROW_FIELD_EQ(tx_should_read_gas_used, 1)));
}

} // namespace
} // namespace bb::avm2::tracegen
