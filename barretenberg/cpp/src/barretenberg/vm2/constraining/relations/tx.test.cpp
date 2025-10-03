#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_tx.hpp"
#include "barretenberg/vm2/generated/relations/tx.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/tracegen/calldata_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/tx_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using tracegen::TxTraceBuilder;
using FF = AvmFlavorSettings::FF;
using C = Column;
using tx = bb::avm2::tx<FF>;

TEST(TxExecutionConstrainingTest, NegativeEmptyTrace)
{
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx>(testing::empty_trace()), "SEL_ON_FIRST_ROW");
}

TEST(TxExecutionConstrainingTest, NegativeEarlyEnd)
{
    TestTraceContainer trace({
        {
            // Row 0
            { C::precomputed_first_row, 1 },
        },
        {
            // Row 1
            { C::tx_sel, 1 },
        },
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx>(trace, tx::SR_NO_EARLY_END), "NO_EARLY_END");
}

TEST(TxExecutionConstrainingTest, NegativeNoExtraneousRows)
{
    TestTraceContainer trace({
        {
            // Row 0
            { C::precomputed_first_row, 1 },
        },
        {
            // Row 1
            { C::tx_sel, 0 },
        },
        {
            // Row 2
            { C::tx_sel, 1 },
        },
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx>(trace, tx::SR_NO_EXTRANEOUS_ROWS), "NO_EXTRANEOUS_ROWS");
}

class TxExecutionConstrainingTestHelper : public ::testing::Test {
  public:
    tracegen::PrecomputedTraceBuilder precomputed_builder;
    tracegen::PublicInputsTraceBuilder public_inputs_builder;
    static void set_initial_columns(TestTraceContainer& trace,
                                    const std::vector<PublicCallRequest>& setup_call_requests,
                                    const std::vector<PublicCallRequest>& app_logic_call_requests)
    {
        uint32_t row = 0;
        // Prepended first row:
        trace.set(row++, { { { C::precomputed_clk, 0 }, { C::precomputed_first_row, 1 } } });
        // Nullifer, note, and message insertion:
        trace.set(
            row++,
            { {
                { C::tx_sel, 1 },
                { C::tx_start_tx, 1 },
                { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NULLIFIER_INSERTION) },
                { C::tx_is_padded, 1 },
                { C::tx_is_tree_insert_phase, 1 },
                { C::tx_sel_non_revertible_append_nullifier, 1 },
                { C::tx_sel_can_emit_nullifier, 1 },

                { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX },
                { C::tx_sel_read_phase_length, 1 },
                { C::tx_read_pi_length_offset,
                  AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },

                { C::tx_start_phase, 1 },
                { C::tx_end_phase, 1 },
                { C::tx_next_context_id, 1 },
            } });
        trace.set(row++,
                  { {
                      { C::tx_sel, 1 },
                      { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION) },
                      { C::tx_is_padded, 1 },
                      { C::tx_is_tree_insert_phase, 1 },
                      { C::tx_sel_non_revertible_append_note_hash, 1 },
                      { C::tx_sel_can_emit_note_hash, 1 },
                      { C::tx_read_pi_offset,
                        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX },
                      { C::tx_sel_read_phase_length, 1 },
                      { C::tx_read_pi_length_offset,
                        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },
                      { C::tx_start_phase, 1 },
                      { C::tx_end_phase, 1 },
                      { C::tx_next_context_id, 1 },
                  } });
        trace.set(
            row++,
            { {
                { C::tx_sel, 1 },
                { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_L2_TO_L1_MESSAGE) },
                { C::tx_is_padded, 1 },
                { C::tx_sel_non_revertible_append_l2_l1_msg, 1 },
                { C::tx_sel_can_emit_l2_l1_msg, 1 },

                { C::tx_read_pi_offset,
                  AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
                { C::tx_sel_read_phase_length, 1 },
                { C::tx_read_pi_length_offset,
                  AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
                { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },

                { C::tx_start_phase, 1 },
                { C::tx_end_phase, 1 },
                { C::tx_next_context_id, 1 },
            } });
        // Setup calls:
        auto calls_remaining = setup_call_requests.size();
        auto read_pi_offset = AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX;
        for (auto setup_call : setup_call_requests) {
            bool is_first_call = calls_remaining == setup_call_requests.size();
            trace.set(
                row++,
                { {
                    { C::tx_sel, 1 },
                    { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
                    { C::tx_start_phase, is_first_call ? 1 : 0 },
                    { C::tx_end_phase, calls_remaining == 1 ? 1 : 0 },
                    { C::tx_sel_read_phase_length, is_first_call ? 1 : 0 },
                    // Lookup Precomputed Table Values
                    { C::tx_is_public_call_request, 1 },
                    { C::tx_should_process_call_request, 1 },
                    { C::tx_read_pi_offset, read_pi_offset },
                    { C::tx_read_pi_length_offset,
                      is_first_call ? AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX : 0 },
                    { C::tx_remaining_phase_counter, calls_remaining },
                    { C::tx_remaining_phase_inv, FF(calls_remaining).invert() },
                    { C::tx_remaining_phase_minus_one_inv,
                      calls_remaining == 1 ? 0 : FF(calls_remaining - 1).invert() },
                    { C::tx_sel_can_emit_note_hash, 1 },
                    { C::tx_sel_can_emit_nullifier, 1 },
                    { C::tx_sel_can_write_public_data, 1 },
                    { C::tx_sel_can_emit_unencrypted_log, 1 },
                    { C::tx_sel_can_emit_l2_l1_msg, 1 },
                    // Public Input Loaded Values
                    { C::tx_msg_sender, setup_call.msgSender },
                    { C::tx_contract_addr, setup_call.contractAddress },
                    { C::tx_is_static, setup_call.isStaticCall },
                    { C::tx_calldata_hash, setup_call.calldataHash },
                } });
            calls_remaining--;
            read_pi_offset++;
        }
        // Nullifer, note, and message insertion:
        trace.set(
            row++,
            { {
                { C::tx_sel, 1 },
                { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NULLIFIER_INSERTION) },
                { C::tx_is_padded, 1 },
                { C::tx_is_tree_insert_phase, 1 },
                { C::tx_sel_revertible_append_nullifier, 1 },
                { C::tx_sel_can_emit_nullifier, 1 },
                { C::tx_is_revertible, 1 },
                { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX },
                { C::tx_sel_read_phase_length, 1 },
                { C::tx_read_pi_length_offset,
                  AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },
                { C::tx_start_phase, 1 },
                { C::tx_end_phase, 1 },
            } });
        trace.set(
            row++,
            { {
                { C::tx_sel, 1 },
                { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NOTE_INSERTION) },
                { C::tx_is_padded, 1 },
                { C::tx_is_tree_insert_phase, 1 },
                { C::tx_sel_revertible_append_note_hash, 1 },
                { C::tx_sel_can_emit_note_hash, 1 },
                { C::tx_is_revertible, 1 },
                { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX },
                { C::tx_sel_read_phase_length, 1 },
                { C::tx_read_pi_length_offset,
                  AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },
                { C::tx_start_phase, 1 },
                { C::tx_end_phase, 1 },
            } });
        trace.set(
            row++,
            { {
                { C::tx_sel, 1 },
                { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_L2_TO_L1_MESSAGE) },
                { C::tx_is_padded, 1 },
                { C::tx_sel_revertible_append_l2_l1_msg, 1 },
                { C::tx_sel_can_emit_l2_l1_msg, 1 },
                { C::tx_is_revertible, 1 },
                { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
                { C::tx_sel_read_phase_length, 1 },
                { C::tx_read_pi_length_offset,
                  AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
                { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
                { C::tx_start_phase, 1 },
                { C::tx_end_phase, 1 },
            } });
        // App logic calls:
        calls_remaining = app_logic_call_requests.size();
        read_pi_offset = AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX;
        for (auto app_logic_call : app_logic_call_requests) {
            bool is_first_call = calls_remaining == app_logic_call_requests.size();
            trace.set(
                row++,
                { {
                    { C::tx_sel, 1 },
                    { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::APP_LOGIC) },
                    { C::tx_start_phase, is_first_call ? 1 : 0 },
                    { C::tx_end_phase, calls_remaining == 1 ? 1 : 0 },
                    { C::tx_sel_read_phase_length, is_first_call ? 1 : 0 },
                    // Lookup Precomputed Table Values
                    { C::tx_is_public_call_request, 1 },
                    { C::tx_should_process_call_request, 1 },
                    { C::tx_read_pi_offset, read_pi_offset },
                    { C::tx_read_pi_length_offset,
                      is_first_call ? AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX : 0 },
                    { C::tx_remaining_phase_counter, calls_remaining },
                    { C::tx_remaining_phase_inv, FF(calls_remaining).invert() },
                    { C::tx_remaining_phase_minus_one_inv,
                      calls_remaining == 1 ? 0 : FF(calls_remaining - 1).invert() },
                    { C::tx_is_revertible, 1 },
                    { C::tx_sel_can_emit_note_hash, 1 },
                    { C::tx_sel_can_emit_nullifier, 1 },
                    { C::tx_sel_can_write_public_data, 1 },
                    { C::tx_sel_can_emit_unencrypted_log, 1 },
                    { C::tx_sel_can_emit_l2_l1_msg, 1 },
                    // Public Input Loaded Values
                    { C::tx_msg_sender, app_logic_call.msgSender },
                    { C::tx_contract_addr, app_logic_call.contractAddress },
                    { C::tx_is_static, app_logic_call.isStaticCall },
                    { C::tx_calldata_hash, app_logic_call.calldataHash },
                } });
            calls_remaining--;
            read_pi_offset++;
        }
        // Teardown:
        trace.set(row++,
                  { {
                      { C::tx_sel, 1 },
                      { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::TEARDOWN) },
                      { C::tx_is_teardown_phase, 1 },
                      { C::tx_sel_read_phase_length, 1 },
                      { C::tx_read_pi_length_offset,
                        AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX },
                      { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX },
                      { C::tx_is_public_call_request, 1 },
                      { C::tx_is_revertible, 1 },
                      { C::tx_sel_can_emit_note_hash, 1 },
                      { C::tx_sel_can_emit_nullifier, 1 },
                      { C::tx_sel_can_write_public_data, 1 },
                      { C::tx_sel_can_emit_unencrypted_log, 1 },
                      { C::tx_sel_can_emit_l2_l1_msg, 1 },
                      { C::tx_start_phase, 1 },
                      { C::tx_end_phase, 1 },
                  } });
        // Collect fees
        trace.set(row++,
                  { {
                      { C::tx_sel, 1 },
                      { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::COLLECT_GAS_FEES) },
                      { C::tx_remaining_phase_counter, 1 },
                      { C::tx_remaining_phase_inv, 1 },
                      { C::tx_is_collect_fee, 1 },
                      { C::tx_sel_can_write_public_data, 1 },
                      { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX },
                      { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX },
                      { C::tx_fee_juice_contract_address, FEE_JUICE_ADDRESS },
                      { C::tx_fee_juice_balances_slot, FEE_JUICE_BALANCES_SLOT },
                      { C::tx_fee_payer_pi_offset, AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX },
                      { C::tx_start_phase, 1 },
                      { C::tx_end_phase, 1 },
                      { C::tx_uint32_max, 0xffffffff },
                  } });
        // Tree Padding
        trace.set(row++,
                  { {
                      { C::tx_sel, 1 },
                      { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::TREE_PADDING) },
                      { C::tx_start_phase, 1 },
                      { C::tx_end_phase, 1 },
                      { C::tx_is_tree_padding, 1 },
                      { C::tx_remaining_phase_counter, 1 },
                      { C::tx_remaining_phase_inv, 1 },
                      { C::tx_sel_can_emit_note_hash, 1 },
                      { C::tx_sel_can_emit_nullifier, 1 },
                      { C::tx_next_note_hash_tree_size, MAX_NOTE_HASHES_PER_TX },
                      { C::tx_next_nullifier_tree_size, MAX_NULLIFIERS_PER_TX },
                  } });
        // Cleanup
        trace.set(row++,
                  { {
                      { C::tx_sel, 1 },
                      { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::CLEANUP) },
                      { C::tx_start_phase, 1 },
                      { C::tx_end_phase, 1 },
                      { C::tx_is_cleanup, 1 },
                      { C::tx_remaining_phase_counter, 1 },
                      { C::tx_remaining_phase_inv, 1 },
                  } });
    }
};

TEST_F(TxExecutionConstrainingTestHelper, SimpleControlFlowRead)
{
    auto test_public_inputs = testing::PublicInputsBuilder()
                                  .rand_public_setup_call_requests(2)
                                  .rand_public_app_logic_call_requests(1)
                                  .build();

    auto first_setup_call_request = test_public_inputs.publicSetupCallRequests[0];
    auto second_setup_call_request = test_public_inputs.publicSetupCallRequests[1];
    auto app_logic_call_request = test_public_inputs.publicAppLogicCallRequests[0];

    TestTraceContainer trace;
    set_initial_columns(trace, { first_setup_call_request, second_setup_call_request }, { app_logic_call_request });

    // Set is_padded at teardown:
    trace.set(10,
              { {
                  { C::tx_is_padded, 1 },
              } });

    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    precomputed_builder.process_phase_table(trace);
    precomputed_builder.process_misc(trace, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    check_relation<tx>(trace);
    check_interaction<TxTraceBuilder,
                      lookup_tx_read_phase_table_settings,
                      lookup_tx_read_phase_length_settings,
                      lookup_tx_read_public_call_request_phase_settings>(trace);
}

TEST_F(TxExecutionConstrainingTestHelper, JumpOnRevert)
{
    TestTraceContainer trace;
    set_initial_columns(
        trace,
        { PublicCallRequest{ .msgSender = 0, .contractAddress = 0, .isStaticCall = false, .calldataHash = 0 } },
        {});

    // Set reverted at row 7, message phase:
    trace.set(7,
              { {
                  { C::tx_is_padded, 0 },
                  { C::tx_sel_revertible_append_l2_l1_msg, 0 }, // switch off for testing
                  { C::tx_remaining_phase_counter, 1 },
                  { C::tx_remaining_phase_inv, 1 },
                  { C::tx_is_revertible, 1 },
                  { C::tx_reverted, 1 },
              } });
    // Set teardown as padded:
    trace.set(8, { { { C::tx_is_padded, 1 } } });

    precomputed_builder.process_phase_table(trace);

    check_relation<tx>(trace);
    check_interaction<TxTraceBuilder, lookup_tx_phase_jump_on_revert_settings>(trace);
}

} // namespace

TEST(TxExecutionConstrainingTest, WriteTreeValue)
{
    auto test_public_inputs = testing::PublicInputsBuilder().rand_previous_non_revertible_accumulated_data(1).build();

    auto pub_inputs_col = test_public_inputs.to_columns();
    TestTraceContainer trace({
        // Row 0
        { { C::precomputed_clk, 0 }, { C::precomputed_first_row, 1 } },

        // Row 1
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NULLIFIER_INSERTION) },
          { C::tx_start_phase, 1 },

          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX },

          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_leaf_value, test_public_inputs.previousNonRevertibleAccumulatedData.nullifiers[0] },
          { C::tx_prev_num_nullifiers_emitted, 0 },
          { C::tx_next_num_nullifiers_emitted, 1 },
          { C::tx_end_phase, 1 } },

        // Row 2
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION) },
          { C::tx_start_phase, 1 },

          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX },

          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_leaf_value, test_public_inputs.previousNonRevertibleAccumulatedData.noteHashes[0] },
          { C::tx_prev_num_note_hashes_emitted, 0 },
          { C::tx_next_num_note_hashes_emitted, 1 },
          { C::tx_end_phase, 1 } },

        // Row 3
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_L2_TO_L1_MESSAGE) },
          { C::tx_start_phase, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },

          { C::tx_sel_non_revertible_append_l2_l1_msg, 1 },
          { C::tx_l2_l1_msg_content,
            test_public_inputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].message.content },
          { C::tx_l2_l1_msg_recipient,
            test_public_inputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].message.recipient },
          { C::tx_l2_l1_msg_contract_address,
            test_public_inputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].contractAddress },
          { C::tx_end_phase, 1 } },

        // Row 4
        // Setup
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
          { C::tx_start_phase, 1 },
          { C::tx_is_padded, 1 },
          { C::tx_read_pi_length_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX },
          { C::tx_end_phase, 1 } },

        // Row 5
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NULLIFIER_INSERTION) },
          { C::tx_start_phase, 1 },

          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX },

          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_leaf_value, test_public_inputs.previousRevertibleAccumulatedData.nullifiers[0] },
          { C::tx_prev_num_nullifiers_emitted, 1 },
          { C::tx_next_num_nullifiers_emitted, 2 },
          { C::tx_end_phase, 1 } },

        // Row 6
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NOTE_INSERTION) },
          { C::tx_start_phase, 1 },

          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX },

          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_leaf_value, test_public_inputs.previousRevertibleAccumulatedData.noteHashes[0] },
          { C::tx_prev_num_note_hashes_emitted, 1 },
          { C::tx_next_num_note_hashes_emitted, 2 },
          { C::tx_end_phase, 1 } },

        // Row 7
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_L2_TO_L1_MESSAGE) },
          { C::tx_start_phase, 1 },

          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + 1 },

          { C::tx_sel_revertible_append_l2_l1_msg, 1 },
          { C::tx_l2_l1_msg_content,
            test_public_inputs.previousRevertibleAccumulatedData.l2ToL1Msgs[0].message.content },
          { C::tx_l2_l1_msg_recipient,
            test_public_inputs.previousRevertibleAccumulatedData.l2ToL1Msgs[0].message.recipient },
          { C::tx_l2_l1_msg_contract_address,
            test_public_inputs.previousRevertibleAccumulatedData.l2ToL1Msgs[0].contractAddress },
          { C::tx_end_phase, 1 } },

        // App Logic
        // Row 8
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::APP_LOGIC) },
          { C::tx_start_phase, 1 },
          { C::tx_is_padded, 1 },
          { C::tx_read_pi_length_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX },
          { C::tx_end_phase, 1 } },

        // Row 9
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::TEARDOWN) },
          { C::tx_read_pi_length_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX },
          { C::tx_is_padded, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },
    });

    tracegen::PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    tracegen::PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_tree_insert_value_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_l2_l1_msg_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_write_l2_l1_msg_settings>()->process(trace);
}

TEST_F(TxExecutionConstrainingTestHelper, CollectFees)
{
    auto test_public_inputs = testing::PublicInputsBuilder()
                                  .rand_public_setup_call_requests(2)
                                  .rand_public_app_logic_call_requests(1)
                                  .rand_public_teardown_call_request()
                                  .build();

    auto first_setup_call_request = test_public_inputs.publicSetupCallRequests[0];
    auto second_setup_call_request = test_public_inputs.publicSetupCallRequests[1];
    auto app_logic_call_request = test_public_inputs.publicAppLogicCallRequests[0];
    auto teardown_call_request = test_public_inputs.publicTeardownCallRequest;

    TestTraceContainer trace;
    set_initial_columns(trace, { first_setup_call_request, second_setup_call_request }, { app_logic_call_request });

    // Set gas used values:
    for (uint32_t i = 1; i < 4; i++) {
        trace.set(i,
                  { {
                      { C::tx_prev_da_gas_used, 1 },
                      { C::tx_prev_l2_gas_used, 100 },
                      { C::tx_next_da_gas_used, 1 },
                      { C::tx_next_l2_gas_used, 100 },
                  } });
    }

    trace.set(4,
              { {
                  { C::tx_prev_da_gas_used, 1 },
                  { C::tx_prev_l2_gas_used, 100 },
                  { C::tx_prev_da_gas_used_sent_to_enqueued_call, 1 },
                  { C::tx_prev_l2_gas_used_sent_to_enqueued_call, 100 },
                  { C::tx_next_da_gas_used, 2 },
                  { C::tx_next_l2_gas_used, 200 },
                  { C::tx_next_da_gas_used_sent_to_enqueued_call, 2 },
                  { C::tx_next_l2_gas_used_sent_to_enqueued_call, 200 },
              } });

    trace.set(5,
              { {
                  { C::tx_prev_da_gas_used, 2 },
                  { C::tx_prev_l2_gas_used, 200 },
                  { C::tx_prev_da_gas_used_sent_to_enqueued_call, 2 },
                  { C::tx_prev_l2_gas_used_sent_to_enqueued_call, 200 },
                  { C::tx_next_da_gas_used, 3 },
                  { C::tx_next_l2_gas_used, 300 },
                  { C::tx_next_da_gas_used_sent_to_enqueued_call, 3 },
                  { C::tx_next_l2_gas_used_sent_to_enqueued_call, 300 },
              } });

    for (uint32_t i = 6; i < 9; i++) {
        trace.set(i,
                  { {
                      { C::tx_prev_da_gas_used, 3 },
                      { C::tx_prev_l2_gas_used, 300 },
                      { C::tx_next_da_gas_used, 3 },
                      { C::tx_next_l2_gas_used, 300 },
                  } });
    }

    trace.set(9,
              { {
                  { C::tx_prev_da_gas_used, 3 },
                  { C::tx_prev_l2_gas_used, 300 },
                  { C::tx_prev_da_gas_used_sent_to_enqueued_call, 3 },
                  { C::tx_prev_l2_gas_used_sent_to_enqueued_call, 300 },
                  { C::tx_next_da_gas_used, 4 },
                  { C::tx_next_l2_gas_used, 400 },
                  { C::tx_next_da_gas_used_sent_to_enqueued_call, 4 },
                  { C::tx_next_l2_gas_used_sent_to_enqueued_call, 400 },
              } });

    trace.set(10,
              { {
                  { C::tx_should_process_call_request, 1 },
                  { C::tx_remaining_phase_counter, 1 },
                  { C::tx_remaining_phase_inv, 1 },
                  // Public Input Loaded Values
                  { C::tx_msg_sender, teardown_call_request.msgSender },
                  { C::tx_contract_addr, teardown_call_request.contractAddress },
                  { C::tx_is_static, teardown_call_request.isStaticCall },
                  { C::tx_calldata_hash, teardown_call_request.calldataHash },
                  { C::tx_prev_da_gas_used, 4 },
                  { C::tx_prev_l2_gas_used, 400 },
                  { C::tx_prev_da_gas_used_sent_to_enqueued_call, 0 },
                  { C::tx_prev_l2_gas_used_sent_to_enqueued_call, 0 },
                  { C::tx_next_da_gas_used, 4 },
                  { C::tx_next_l2_gas_used, 400 },
                  { C::tx_next_da_gas_used_sent_to_enqueued_call, 13213 },
                  { C::tx_next_l2_gas_used_sent_to_enqueued_call, 456789 },
              } });

    trace.set(11,
              { {
                  { C::tx_prev_da_gas_used, 4 },
                  { C::tx_prev_l2_gas_used, 400 },
                  { C::tx_next_da_gas_used, 4 },
                  { C::tx_next_l2_gas_used, 400 },
              } });

    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    precomputed_builder.process_phase_table(trace);
    precomputed_builder.process_misc(trace, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    check_relation<tx>(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_phase_table_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_phase_length_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_public_call_request_phase_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_effective_fee_public_inputs_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_fee_payer_public_inputs_settings>()->process(trace);
}

TEST(TxExecutionConstrainingTest, NegativePaddingChecks)
{
    TestTraceContainer trace({
        {
            // Row 0
            { C::precomputed_first_row, 1 },
        },
        {
            // Row 1
            { C::tx_sel, 1 },
            { C::tx_is_tree_padding, 1 },
            { C::tx_prev_note_hash_tree_root, 42 },
            { C::tx_next_note_hash_tree_root, 42 },
            { C::tx_prev_note_hash_tree_size, 5 },
            { C::tx_next_note_hash_tree_size, MAX_NOTE_HASHES_PER_TX },
            { C::tx_prev_num_note_hashes_emitted, 5 },
            { C::tx_next_num_note_hashes_emitted, 5 },
            { C::tx_prev_nullifier_tree_root, 43 },
            { C::tx_next_nullifier_tree_root, 43 },
            { C::tx_prev_nullifier_tree_size, 7 },
            { C::tx_next_nullifier_tree_size, MAX_NULLIFIERS_PER_TX },
            { C::tx_prev_num_nullifiers_emitted, 7 },
            { C::tx_next_num_nullifiers_emitted, 7 },
        },
    });
    check_relation<tx>(trace,
                       tx::SR_NOTE_HASH_TREE_ROOT_IMMUTABLE_IN_PADDING,
                       tx::SR_PAD_NOTE_HASH_TREE,
                       tx::SR_NOTE_HASHES_EMITTED_IMMUTABLE_IN_PADDING,
                       tx::SR_NULLIFIER_TREE_ROOT_IMMUTABLE_IN_PADDING,
                       tx::SR_PAD_NULLIFIER_TREE,
                       tx::SR_NULLIFIERS_EMITTED_IMMUTABLE_IN_PADDING);

    // Negative test: change note hash root in padding
    trace.set(C::tx_next_note_hash_tree_root, 1, 999);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx>(trace, tx::SR_NOTE_HASH_TREE_ROOT_IMMUTABLE_IN_PADDING),
                              "NOTE_HASH_TREE_ROOT_IMMUTABLE_IN_PADDING");

    // Negative test: change num emitted note hashes in padding
    trace.set(C::tx_next_num_note_hashes_emitted, 1, 999);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx>(trace, tx::SR_NOTE_HASHES_EMITTED_IMMUTABLE_IN_PADDING),
                              "NOTE_HASHES_EMITTED_IMMUTABLE_IN_PADDING");

    // Negative test: change nullifier tree root in padding
    trace.set(C::tx_next_nullifier_tree_root, 1, 999);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx>(trace, tx::SR_NULLIFIER_TREE_ROOT_IMMUTABLE_IN_PADDING),
                              "NULLIFIER_TREE_ROOT_IMMUTABLE_IN_PADDING");

    // Negative test: change num emitted nullifiers in padding
    trace.set(C::tx_next_num_nullifiers_emitted, 1, 999);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx>(trace, tx::SR_NULLIFIERS_EMITTED_IMMUTABLE_IN_PADDING),
                              "NULLIFIERS_EMITTED_IMMUTABLE_IN_PADDING");

    // Negative test: wrong note hash padding check
    trace.set(C::tx_next_note_hash_tree_size, 1, MAX_NOTE_HASHES_PER_TX - 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx>(trace, tx::SR_PAD_NOTE_HASH_TREE), "PAD_NOTE_HASH_TREE");

    // Negative test: wrong nullifier padding check
    trace.set(C::tx_next_nullifier_tree_size, 1, MAX_NULLIFIERS_PER_TX - 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx>(trace, tx::SR_PAD_NULLIFIER_TREE), "PAD_NULLIFIER_TREE");
}

class TxExecutionConstrainingWithCalldataTest : public TxExecutionConstrainingTestHelper {
  public:
    simulation::EventEmitter<simulation::Poseidon2HashEvent> hash_event_emitter;
    simulation::EventEmitter<simulation::Poseidon2PermutationEvent> perm_event_emitter;
    simulation::EventEmitter<simulation::Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    ::testing::StrictMock<simulation::MockGreaterThan> mock_gt;
    ::testing::StrictMock<simulation::MockExecutionIdManager> mock_execution_id_manager;

    tracegen::Poseidon2TraceBuilder poseidon2_builder;
    tracegen::CalldataTraceBuilder calldata_builder;
};

TEST_F(TxExecutionConstrainingWithCalldataTest, SimpleHandleCalldata)
{
    simulation::Poseidon2 poseidon2 = simulation::Poseidon2(
        mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    auto test_public_inputs = testing::PublicInputsBuilder()
                                  .rand_public_setup_call_requests(1)
                                  .rand_public_app_logic_call_requests(2)
                                  .build();

    std::vector<FF> dummy_setup_calldata = { 1, 2 };
    std::vector<FF> dummy_setup_calldata_preimage = dummy_setup_calldata;
    dummy_setup_calldata_preimage.insert(dummy_setup_calldata_preimage.begin(), GENERATOR_INDEX__PUBLIC_CALLDATA);
    FF dummy_setup_calldata_hash = poseidon2.hash(dummy_setup_calldata_preimage);
    test_public_inputs.publicSetupCallRequests[0].calldataHash = dummy_setup_calldata_hash;

    std::vector<FF> non_empty_calldata = { 2, 3, 4 };
    std::vector<FF> non_empty_calldata_preimage = non_empty_calldata;
    non_empty_calldata_preimage.insert(non_empty_calldata_preimage.begin(), GENERATOR_INDEX__PUBLIC_CALLDATA);
    FF non_empty_calldata_hash = poseidon2.hash(non_empty_calldata_preimage);
    test_public_inputs.publicAppLogicCallRequests[0].calldataHash = non_empty_calldata_hash;

    FF empty_calldata_hash = poseidon2.hash({ GENERATOR_INDEX__PUBLIC_CALLDATA });
    test_public_inputs.publicAppLogicCallRequests[1].calldataHash = empty_calldata_hash;

    std::vector<simulation::CalldataEvent> calldata_events = {
        { .context_id = 1,
          .calldata_size = static_cast<uint32_t>(dummy_setup_calldata.size()),
          .calldata = dummy_setup_calldata },
        { .context_id = 5,
          .calldata_size = static_cast<uint32_t>(non_empty_calldata.size()),
          .calldata = non_empty_calldata },
        { .context_id = 6, .calldata_size = 0, .calldata = {} }
    };

    auto setup_call_request = test_public_inputs.publicSetupCallRequests[0];
    auto non_empty_calldata_app_logic_call_request = test_public_inputs.publicAppLogicCallRequests[0];
    auto empty_calldata_app_logic_call_request = test_public_inputs.publicAppLogicCallRequests[1];

    TestTraceContainer trace;

    set_initial_columns(trace,
                        { setup_call_request },
                        { non_empty_calldata_app_logic_call_request, empty_calldata_app_logic_call_request });

    // Set calldata specific values for setup:
    trace.set(4, { { { C::tx_calldata_size, 2 }, { C::tx_next_context_id, 1 } } });

    // Set calldata specific values for non empty calldata call:
    trace.set(8, { { { C::tx_calldata_size, 3 }, { C::tx_next_context_id, 5 } } });

    // Set calldata specific values for empty calldata call:
    trace.set(9, { { { C::tx_calldata_size, 0 }, { C::tx_next_context_id, 6 } } });

    // Set teardown as padded:
    trace.set(10, { { { C::tx_is_padded, 1 } } });

    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    precomputed_builder.process_phase_table(trace);
    precomputed_builder.process_misc(trace, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    calldata_builder.process_retrieval(calldata_events, trace);
    calldata_builder.process_hashing(calldata_events, trace);

    check_relation<tx>(trace);
    check_interaction<TxTraceBuilder,
                      lookup_tx_read_calldata_hash_settings,
                      lookup_tx_read_phase_table_settings,
                      lookup_tx_read_phase_length_settings,
                      lookup_tx_read_public_call_request_phase_settings>(trace);
    check_relation<bb::avm2::calldata_hashing<FF>>(trace);
    check_all_interactions<tracegen::CalldataTraceBuilder>(trace);
}
} // namespace bb::avm2::constraining
