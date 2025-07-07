#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_tx.hpp"
#include "barretenberg/vm2/generated/relations/tx.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
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

TEST(TxExecutionConstrainingTest, EmptyRow)
{
    check_relation<tx>(testing::empty_trace());
}

TEST(TxExecutionConstrainingTest, SimpleControlFlowRead)
{
    auto test_public_inputs = testing::PublicInputsBuilder()
                                  .rand_public_setup_call_requests(2)
                                  .rand_public_app_logic_call_requests(1)
                                  .build();

    auto first_setup_call_request = test_public_inputs.publicSetupCallRequests[0];
    auto second_setup_call_request = test_public_inputs.publicSetupCallRequests[1];
    auto app_logic_call_request = test_public_inputs.publicAppLogicCallRequests[0];

    TestTraceContainer trace({
        // Row 0
        { { C::precomputed_clk, 0 }, { C::precomputed_first_row, 1 } },

        // Row 1
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NULLIFIER_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_sel_non_revertible_append_nullifier, 1 },

          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },

          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 2
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_sel_non_revertible_append_note_hash, 1 },

          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },

          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 3
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_L2_TO_L1_MESSAGE) },
          { C::tx_is_padded, 1 },
          { C::tx_is_l2_l1_msg_phase, 1 },

          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },

          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 4
        // Setup
        {
            { C::tx_sel, 1 },
            { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
            { C::tx_start_phase, 1 },
            { C::tx_sel_read_phase_length, 1 },

            // Lookup Precomputed Table Values
            { C::tx_is_public_call_request, 1 },
            { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX },
            { C::tx_read_pi_length_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX },
            { C::tx_remaining_phase_counter, 2 },
            { C::tx_remaining_phase_inv, FF(2).invert() },
            { C::tx_remaining_phase_minus_one_inv, FF(1).invert() },
            // Public Input Loaded Values
            { C::tx_msg_sender, first_setup_call_request.msgSender },
            { C::tx_contract_addr, first_setup_call_request.contractAddress },
            { C::tx_is_static, first_setup_call_request.isStaticCall },
            { C::tx_calldata_hash, first_setup_call_request.calldataHash },
        },
        // Row 5
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX + 1 },
          { C::tx_remaining_phase_counter, 1 },
          { C::tx_remaining_phase_inv, 1 },
          // Public Input Loaded Values
          { C::tx_msg_sender, second_setup_call_request.msgSender },
          { C::tx_contract_addr, second_setup_call_request.contractAddress },
          { C::tx_is_static, second_setup_call_request.isStaticCall },
          { C::tx_calldata_hash, second_setup_call_request.calldataHash },
          { C::tx_end_phase, 1 } },

        // Row 6
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NULLIFIER_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_sel_revertible_append_nullifier, 1 },
          { C::tx_is_revertible, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 7
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NOTE_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_sel_revertible_append_note_hash, 1 },
          { C::tx_is_revertible, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 8
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_L2_TO_L1_MESSAGE) },
          { C::tx_is_padded, 1 },
          { C::tx_is_l2_l1_msg_phase, 1 },
          { C::tx_is_revertible, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // App Logic
        // Row 9
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::APP_LOGIC) },
          { C::tx_start_phase, 1 },
          { C::tx_sel_read_phase_length, 1 },
          // Lookup Precomputed Table Values
          { C::tx_is_public_call_request, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX },
          { C::tx_read_pi_length_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX },
          { C::tx_remaining_phase_counter, 1 },
          { C::tx_remaining_phase_inv, 1 },
          { C::tx_is_revertible, 1 },
          // Public Input Loaded Values
          { C::tx_msg_sender, app_logic_call_request.msgSender },
          { C::tx_contract_addr, app_logic_call_request.contractAddress },
          { C::tx_is_static, app_logic_call_request.isStaticCall },
          { C::tx_calldata_hash, app_logic_call_request.calldataHash },

          { C::tx_end_phase, 1 } },

        // Row 10
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::TEARDOWN) },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX },
          { C::tx_is_padded, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX },
          { C::tx_is_public_call_request, 1 },
          { C::tx_is_revertible, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 11
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::COLLECT_GAS_FEES) },
          { C::tx_is_padded, 1 },
          { C::tx_is_collect_fee, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX },
          { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX },
          { C::tx_fee_juice_contract_address, FEE_JUICE_ADDRESS },
          { C::tx_fee_juice_balances_slot, FEE_JUICE_BALANCES_SLOT },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 },
          { C::tx_uint32_max, 0xffffffff } },
    });

    tracegen::PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    tracegen::PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_phase_table(trace);
    precomputed_builder.process_misc(trace, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    check_relation<tx>(trace);
    check_interaction<TxTraceBuilder,
                      lookup_tx_read_phase_table_settings,
                      lookup_tx_read_phase_length_settings,
                      lookup_tx_read_public_call_request_phase_settings>(trace);
}

TEST(TxExecutionConstrainingTest, JumpOnRevert)
{
    TestTraceContainer trace({
        // Row 0
        { { C::precomputed_clk, 0 }, { C::precomputed_first_row, 1 } },

        // Row 1
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NULLIFIER_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 2
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 3
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_L2_TO_L1_MESSAGE) },
          { C::tx_is_padded, 1 },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 4
        // Setup
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
          { C::tx_is_padded, 1 },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 5
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NULLIFIER_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 6
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NOTE_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },

        // Row 7
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_L2_TO_L1_MESSAGE) },
          { C::tx_is_padded, 1 },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_is_revertible, 1 },
          { C::tx_reverted, 1 },
          { C::tx_end_phase, 1 } },

        // Row 8 - skipping App logic
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::TEARDOWN) },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_is_padded, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 } },
    });

    tracegen::PrecomputedTraceBuilder precomputed_builder;
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

          { C::tx_is_l2_l1_msg_phase, 1 },
          { C::tx_l2_l1_msg_content,
            test_public_inputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].message.content },
          { C::tx_l2_l1_msg_recipient,
            test_public_inputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].message.recipient },
          { C::tx_l2_l1_msg_contract_address,
            test_public_inputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].contractAddress },
          { C::tx_num_l2_l1_msg_emitted, 0 },
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

          { C::tx_is_l2_l1_msg_phase, 1 },
          { C::tx_l2_l1_msg_content,
            test_public_inputs.previousRevertibleAccumulatedData.l2ToL1Msgs[0].message.content },
          { C::tx_l2_l1_msg_recipient,
            test_public_inputs.previousRevertibleAccumulatedData.l2ToL1Msgs[0].message.recipient },
          { C::tx_l2_l1_msg_contract_address,
            test_public_inputs.previousRevertibleAccumulatedData.l2ToL1Msgs[0].contractAddress },
          { C::tx_num_l2_l1_msg_emitted, 1 },
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

TEST(TxExecutionConstrainingTest, CollectFees)
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

    TestTraceContainer trace({
        // Row 0
        { { C::precomputed_clk, 0 }, { C::precomputed_first_row, 1 } },

        // Row 1
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NULLIFIER_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_sel_non_revertible_append_nullifier, 1 },

          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },

          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 },
          { C::tx_prev_da_gas_used, 1 },
          { C::tx_prev_l2_gas_used, 100 },
          { C::tx_next_da_gas_used, 1 },
          { C::tx_next_l2_gas_used, 100 } },

        // Row 2
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_sel_non_revertible_append_note_hash, 1 },

          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },

          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 },
          { C::tx_prev_da_gas_used, 1 },
          { C::tx_prev_l2_gas_used, 100 },
          { C::tx_next_da_gas_used, 1 },
          { C::tx_next_l2_gas_used, 100 } },

        // Row 3
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_L2_TO_L1_MESSAGE) },
          { C::tx_is_padded, 1 },
          { C::tx_is_l2_l1_msg_phase, 1 },

          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },

          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 },
          { C::tx_prev_da_gas_used, 1 },
          { C::tx_prev_l2_gas_used, 100 },
          { C::tx_next_da_gas_used, 1 },
          { C::tx_next_l2_gas_used, 100 } },

        // Row 4
        // Setup
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
          { C::tx_start_phase, 1 },
          { C::tx_sel_read_phase_length, 1 },

          // Lookup Precomputed Table Values
          { C::tx_is_public_call_request, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX },
          { C::tx_read_pi_length_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX },
          { C::tx_remaining_phase_counter, 2 },
          { C::tx_remaining_phase_inv, FF(2).invert() },
          { C::tx_remaining_phase_minus_one_inv, FF(1).invert() },
          // Public Input Loaded Values
          { C::tx_msg_sender, first_setup_call_request.msgSender },
          { C::tx_contract_addr, first_setup_call_request.contractAddress },
          { C::tx_is_static, first_setup_call_request.isStaticCall },
          { C::tx_calldata_hash, first_setup_call_request.calldataHash },
          { C::tx_prev_da_gas_used, 1 },
          { C::tx_prev_l2_gas_used, 100 },
          { C::tx_prev_da_gas_used_sent_to_enqueued_call, 1 },
          { C::tx_prev_l2_gas_used_sent_to_enqueued_call, 100 },
          { C::tx_next_da_gas_used, 2 },
          { C::tx_next_l2_gas_used, 200 },
          { C::tx_next_da_gas_used_sent_to_enqueued_call, 2 },
          { C::tx_next_l2_gas_used_sent_to_enqueued_call, 200 } },
        // Row 5
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP) },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX + 1 },
          { C::tx_remaining_phase_counter, 1 },
          { C::tx_remaining_phase_inv, 1 },
          // Public Input Loaded Values
          { C::tx_msg_sender, second_setup_call_request.msgSender },
          { C::tx_contract_addr, second_setup_call_request.contractAddress },
          { C::tx_is_static, second_setup_call_request.isStaticCall },
          { C::tx_calldata_hash, second_setup_call_request.calldataHash },
          { C::tx_end_phase, 1 },
          { C::tx_prev_da_gas_used, 2 },
          { C::tx_prev_l2_gas_used, 200 },
          { C::tx_prev_da_gas_used_sent_to_enqueued_call, 2 },
          { C::tx_prev_l2_gas_used_sent_to_enqueued_call, 200 },
          { C::tx_next_da_gas_used, 3 },
          { C::tx_next_l2_gas_used, 300 },
          { C::tx_next_da_gas_used_sent_to_enqueued_call, 3 },
          { C::tx_next_l2_gas_used_sent_to_enqueued_call, 300 } },

        // Row 6
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NULLIFIER_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_sel_revertible_append_nullifier, 1 },
          { C::tx_is_revertible, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 },
          { C::tx_prev_da_gas_used, 3 },
          { C::tx_prev_l2_gas_used, 300 },
          { C::tx_next_da_gas_used, 3 },
          { C::tx_next_l2_gas_used, 300 } },

        // Row 7
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_NOTE_INSERTION) },
          { C::tx_is_padded, 1 },
          { C::tx_is_tree_insert_phase, 1 },
          { C::tx_sel_revertible_append_note_hash, 1 },
          { C::tx_is_revertible, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 },
          { C::tx_prev_da_gas_used, 3 },
          { C::tx_prev_l2_gas_used, 300 },
          { C::tx_next_da_gas_used, 3 },
          { C::tx_next_l2_gas_used, 300 } },

        // Row 8
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::R_L2_TO_L1_MESSAGE) },
          { C::tx_is_padded, 1 },
          { C::tx_is_l2_l1_msg_phase, 1 },
          { C::tx_is_revertible, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_length_offset,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 },
          { C::tx_prev_da_gas_used, 3 },
          { C::tx_prev_l2_gas_used, 300 },
          { C::tx_next_da_gas_used, 3 },
          { C::tx_next_l2_gas_used, 300 } },

        // App Logic
        // Row 9
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::APP_LOGIC) },
          { C::tx_start_phase, 1 },
          { C::tx_sel_read_phase_length, 1 },
          // Lookup Precomputed Table Values
          { C::tx_is_public_call_request, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX },
          { C::tx_read_pi_length_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX },
          { C::tx_remaining_phase_counter, 1 },
          { C::tx_remaining_phase_inv, 1 },
          { C::tx_is_revertible, 1 },
          // Public Input Loaded Values
          { C::tx_msg_sender, app_logic_call_request.msgSender },
          { C::tx_contract_addr, app_logic_call_request.contractAddress },
          { C::tx_is_static, app_logic_call_request.isStaticCall },
          { C::tx_calldata_hash, app_logic_call_request.calldataHash },

          { C::tx_end_phase, 1 },
          { C::tx_prev_da_gas_used, 3 },
          { C::tx_prev_l2_gas_used, 300 },
          { C::tx_prev_da_gas_used_sent_to_enqueued_call, 3 },
          { C::tx_prev_l2_gas_used_sent_to_enqueued_call, 300 },
          { C::tx_next_da_gas_used, 4 },
          { C::tx_next_l2_gas_used, 400 },
          { C::tx_next_da_gas_used_sent_to_enqueued_call, 4 },
          { C::tx_next_l2_gas_used_sent_to_enqueued_call, 400 } },

        // Row 10
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::TEARDOWN) },
          { C::tx_sel_read_phase_length, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX },
          { C::tx_read_pi_length_offset, AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX },
          { C::tx_is_padded, 0 },
          { C::tx_is_public_call_request, 1 },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 },
          { C::tx_is_teardown_phase, 1 },
          { C::tx_remaining_phase_counter, 1 },
          { C::tx_remaining_phase_inv, 1 },
          { C::tx_is_revertible, 1 },
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
          { C::tx_next_l2_gas_used_sent_to_enqueued_call, 456789 } },

        // Row 11
        { { C::tx_sel, 1 },
          { C::tx_phase_value, static_cast<uint8_t>(TransactionPhase::COLLECT_GAS_FEES) },
          { C::tx_is_padded, 1 },
          { C::tx_is_collect_fee, 1 },
          { C::tx_read_pi_offset, AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX },
          { C::tx_write_pi_offset, AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX },
          { C::tx_fee_juice_contract_address, FEE_JUICE_ADDRESS },
          { C::tx_fee_juice_balances_slot, FEE_JUICE_BALANCES_SLOT },
          { C::tx_start_phase, 1 },
          { C::tx_end_phase, 1 },
          { C::tx_prev_da_gas_used, 4 },
          { C::tx_prev_l2_gas_used, 400 },
          { C::tx_next_da_gas_used, 4 },
          { C::tx_next_l2_gas_used, 400 },
          { C::tx_uint32_max, 0xffffffff } },
    });

    tracegen::PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    tracegen::PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_phase_table(trace);
    precomputed_builder.process_misc(trace, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    check_relation<tx>(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_phase_table_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_phase_length_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_public_call_request_phase_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_effective_fee_public_inputs_settings>()->process(trace);
    TxTraceBuilder::interactions.get_test_job<lookup_tx_read_fee_payer_public_inputs_settings>()->process(trace);
}
} // namespace bb::avm2::constraining
