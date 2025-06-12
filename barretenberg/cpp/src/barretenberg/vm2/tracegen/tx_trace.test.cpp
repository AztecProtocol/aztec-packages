#include "barretenberg/vm2/tracegen/tx_trace.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::bb::avm2::testing::InstructionBuilder;
using enum ::bb::avm2::WireOpCode;

using ::testing::AllOf;
using ::testing::Contains;
using ::testing::Field;

using R = TestTraceContainer::Row;

TEST(TxTraceGenTest, EnqueuedCallEvent)
{
    TestTraceContainer trace;
    TxTraceBuilder builder;

    auto msg_sender = FF::random_element();
    auto contract_address = FF::random_element();
    auto calldata_hash = FF::random_element();

    simulation::TxEvent tx_event = {
        .phase = TransactionPhase::SETUP,
        .prev_tree_state = {},
        .next_tree_state = {},
        .prev_gas_used = {},
        .gas_used = {},
        .gas_limit = {},
        .reverted = false,
        .event =
            simulation::EnqueuedCallEvent{
                .msg_sender = msg_sender,
                .contract_address = contract_address,
                .is_static = false,
                .calldata_hash = calldata_hash,
                .success = true,
            },
    };

    builder.process({ tx_event }, trace);
    auto rows = trace.as_rows();
    ASSERT_EQ(rows.size(), 11); // 10 tx trace rows + 1 precomputed row
    EXPECT_THAT(
        rows[static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION)],
        AllOf(
            ROW_FIELD_EQ(R, tx_sel, 1),
            ROW_FIELD_EQ(R, tx_phase_value, static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION)),
            ROW_FIELD_EQ(R, tx_is_padded, 1),
            ROW_FIELD_EQ(R, tx_is_tree_insert_phase, 1),
            ROW_FIELD_EQ(R, tx_sel_non_revertible_append_note_hash, 1),
            ROW_FIELD_EQ(R,
                         tx_read_pi_length_offset,
                         AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX),
            ROW_FIELD_EQ(
                R, tx_read_pi_offset, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX),
            ROW_FIELD_EQ(R, tx_write_pi_offset, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX),
            ROW_FIELD_EQ(R, tx_start_phase, 1),
            ROW_FIELD_EQ(R, tx_end_phase, 1),
            ROW_FIELD_EQ(R, tx_is_static, false)));

    // Setup
    EXPECT_THAT(rows[static_cast<uint8_t>(TransactionPhase::SETUP)],
                AllOf(ROW_FIELD_EQ(R, tx_sel, 1),
                      ROW_FIELD_EQ(R, tx_phase_value, static_cast<uint8_t>(TransactionPhase::SETUP)),
                      ROW_FIELD_EQ(R, tx_start_phase, 1),
                      ROW_FIELD_EQ(R, tx_is_public_call_request, 1),
                      ROW_FIELD_EQ(R,
                                   tx_read_pi_length_offset,
                                   AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX),
                      ROW_FIELD_EQ(R, tx_read_pi_offset, AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX),
                      ROW_FIELD_EQ(R, tx_remaining_phase_counter, 1),
                      ROW_FIELD_EQ(R, tx_remaining_phase_inv, 1),
                      ROW_FIELD_EQ(R, tx_msg_sender, msg_sender),
                      ROW_FIELD_EQ(R, tx_contract_addr, contract_address),
                      ROW_FIELD_EQ(R, tx_calldata_hash, calldata_hash),
                      ROW_FIELD_EQ(R, tx_end_phase, 1)));
};

} // namespace
} // namespace bb::avm2::tracegen
