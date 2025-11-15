#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/avm_io.hpp"

#include <cstdint>

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

namespace bb::avm2 {
namespace {

using ::testing::SizeIs;

TEST(AvmInputsTest, Deserialization)
{
    // cwd is expected to be barretenberg/cpp/build.
    auto data = read_file("../src/barretenberg/vm2/testing/avm_inputs.testdata.bin");
    // We only check that deserialization does not crash.
    // Correctness of the deserialization itself is assumed via MessagePack.
    // What we are testing here is that the structure of the inputs in TS matches the C++ structs
    // that we have here. If someone changes the structure of the inputs in TS, this test would
    // force them to update the C++ structs as well (and therefore any usage of these structs).
    AvmProvingInputs::from(data);
}

TEST(AvmInputsTest, FormatTransformations)
{
    using ::testing::AllOf;
    using ::testing::ElementsAre;

    PublicInputs pi = testing::get_minimal_trace_with_pi().second;
    auto as_cols = pi.to_columns();
    auto flattened = PublicInputs::columns_to_flat(as_cols);
    auto unflattened = PublicInputs::flat_to_columns(flattened);

    EXPECT_THAT(as_cols, SizeIs(AVM_NUM_PUBLIC_INPUT_COLUMNS));
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; ++i) {
        EXPECT_THAT(as_cols[i], SizeIs(AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH));
    }
    EXPECT_THAT(flattened, SizeIs(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH));

    EXPECT_EQ(as_cols, unflattened);
}

TEST(AvmInputsTest, ValuesInColumns)
{
    // Create a test PublicInputs with specific values in different parts of the struct
    PublicInputs pi;

    // Set global variables
    pi.global_variables.chain_id = 123;
    pi.global_variables.version = 456;
    pi.global_variables.block_number = 12345;
    pi.global_variables.slot_number = 67890;
    pi.global_variables.timestamp = 789000;
    pi.global_variables.coinbase = 123123;
    pi.global_variables.fee_recipient = 9876;

    // Set gas fees
    pi.global_variables.gas_fees.fee_per_da_gas = 111;
    pi.global_variables.gas_fees.fee_per_l2_gas = 222;

    // Set start tree snapshots
    pi.start_tree_snapshots.l1_to_l2_message_tree.root = 1000;
    pi.start_tree_snapshots.l1_to_l2_message_tree.next_available_leaf_index = 2000;
    pi.start_tree_snapshots.note_hash_tree.root = 3000;
    pi.start_tree_snapshots.note_hash_tree.next_available_leaf_index = 4000;
    pi.start_tree_snapshots.nullifier_tree.root = 5000;
    pi.start_tree_snapshots.nullifier_tree.next_available_leaf_index = 6000;
    pi.start_tree_snapshots.public_data_tree.root = 7000;
    pi.start_tree_snapshots.public_data_tree.next_available_leaf_index = 8000;

    // Set gas used
    pi.start_gas_used.da_gas = 100;
    pi.start_gas_used.l2_gas = 200;

    // Set gas settings
    pi.gas_settings.gas_limits.da_gas = 1234;
    pi.gas_settings.gas_limits.l2_gas = 5678;
    pi.gas_settings.teardown_gas_limits.da_gas = 9012;
    pi.gas_settings.teardown_gas_limits.l2_gas = 3456;
    pi.gas_settings.max_fees_per_gas.fee_per_da_gas = 7890;
    pi.gas_settings.max_fees_per_gas.fee_per_l2_gas = 1234;
    pi.gas_settings.max_priority_fees_per_gas.fee_per_da_gas = 5678;
    pi.gas_settings.max_priority_fees_per_gas.fee_per_l2_gas = 9012;

    // Set fee payer
    pi.fee_payer = 12345;

    // Set Public Call Request Array Lengths
    pi.public_call_request_array_lengths.setup_calls = 2;
    pi.public_call_request_array_lengths.app_logic_calls = 3;
    pi.public_call_request_array_lengths.teardown_call = true;

    // Set call requests (using all 4 columns)
    pi.public_setup_call_requests[0].msg_sender = 1111;
    pi.public_setup_call_requests[0].contract_address = 2222;
    pi.public_setup_call_requests[0].is_static_call = true;
    pi.public_setup_call_requests[0].calldata_hash = 3333;

    pi.public_app_logic_call_requests[1].msg_sender = 4444;
    pi.public_app_logic_call_requests[1].contract_address = 5555;
    pi.public_app_logic_call_requests[1].is_static_call = false;
    pi.public_app_logic_call_requests[1].calldata_hash = 6666;

    pi.public_teardown_call_request.msg_sender = 7777;
    pi.public_teardown_call_request.contract_address = 8888;
    pi.public_teardown_call_request.is_static_call = true;
    pi.public_teardown_call_request.calldata_hash = 9999;

    // Set accumulated data array lengths
    pi.previous_non_revertible_accumulated_data_array_lengths.note_hashes = 10;
    pi.previous_non_revertible_accumulated_data_array_lengths.nullifiers = 20;
    pi.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs = 30;

    pi.previous_revertible_accumulated_data_array_lengths.note_hashes = 40;
    pi.previous_revertible_accumulated_data_array_lengths.nullifiers = 50;
    pi.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs = 60;

    // Set l2 to l1 messages (using 3 columns)
    pi.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].message.recipient = 1234;
    pi.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].message.content = 1357;
    pi.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].contract_address = 3579;

    // Set accumulated data elements
    pi.accumulated_data.note_hashes[2] = 54321;
    pi.accumulated_data.nullifiers[3] = 98765;

    // Set l2 to l1 messages in accumulated data
    pi.accumulated_data.l2_to_l1_msgs[1].message.recipient = 3333;
    pi.accumulated_data.l2_to_l1_msgs[1].message.content = 7531;
    pi.accumulated_data.l2_to_l1_msgs[1].contract_address = 9753;

    // Set public logs (spans multiple rows per log)
    std::vector<FF> public_log_fields;
    public_log_fields.reserve(3);
    for (size_t j = 0; j < 3; ++j) {
        public_log_fields.push_back(10000 + j);
    }
    pi.accumulated_data.public_logs.add_log({
        .fields = public_log_fields,
        .contract_address = 11223,
    });

    // Set public data writes
    pi.accumulated_data.public_data_writes[1].leaf_slot = 5555;
    pi.accumulated_data.public_data_writes[1].value = 6666;

    // Set end gas used
    pi.end_gas_used.da_gas = 5000;
    pi.end_gas_used.l2_gas = 7000;

    // Set end tree snapshots
    pi.end_tree_snapshots.l1_to_l2_message_tree.root = 10000;
    pi.end_tree_snapshots.l1_to_l2_message_tree.next_available_leaf_index = 20000;
    pi.end_tree_snapshots.note_hash_tree.root = 30000;
    pi.end_tree_snapshots.note_hash_tree.next_available_leaf_index = 40000;
    pi.end_tree_snapshots.nullifier_tree.root = 50000;
    pi.end_tree_snapshots.nullifier_tree.next_available_leaf_index = 60000;
    pi.end_tree_snapshots.public_data_tree.root = 70000;
    pi.end_tree_snapshots.public_data_tree.next_available_leaf_index = 80000;

    // Set transaction fee
    pi.transaction_fee = 9876;

    // Set accumulated data array lengths
    pi.accumulated_data_array_lengths.note_hashes = 3;
    pi.accumulated_data_array_lengths.nullifiers = 4;
    pi.accumulated_data_array_lengths.l2_to_l1_msgs = 2;
    pi.accumulated_data_array_lengths.public_data_writes = 5;

    // Set reverted flag
    pi.reverted = true;

    // Get the columns representation
    auto columns = pi.to_columns();

    // Convert to flat array for easier testing
    auto flat = PublicInputs::columns_to_flat(columns);
    EXPECT_THAT(flat, SizeIs(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH));

    // Define column offsets based on the total number of rows per column
    const size_t col0_offset = 0;
    const size_t col1_offset = static_cast<size_t>(AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    const size_t col2_offset = static_cast<size_t>(2 * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    const size_t col3_offset = static_cast<size_t>(3 * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    // Verify that some specific values are at the expected positions

    // Global variables
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX], pi.global_variables.chain_id);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX], pi.global_variables.version);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX],
              pi.global_variables.block_number);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX],
              pi.global_variables.slot_number);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX], pi.global_variables.timestamp);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX],
              pi.global_variables.fee_recipient);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX],
              pi.global_variables.gas_fees.fee_per_da_gas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX],
              pi.global_variables.gas_fees.fee_per_l2_gas);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX], pi.global_variables.coinbase);

    // Start tree snapshots
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.start_tree_snapshots.l1_to_l2_message_tree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.start_tree_snapshots.l1_to_l2_message_tree.next_available_leaf_index);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.start_tree_snapshots.note_hash_tree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.start_tree_snapshots.note_hash_tree.next_available_leaf_index);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX],
              pi.start_tree_snapshots.nullifier_tree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX],
              pi.start_tree_snapshots.nullifier_tree.next_available_leaf_index);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX],
              pi.start_tree_snapshots.public_data_tree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX],
              pi.start_tree_snapshots.public_data_tree.next_available_leaf_index);

    // Gas used
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX], pi.start_gas_used.da_gas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX], pi.start_gas_used.l2_gas);

    // Gas settings
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX], pi.gas_settings.gas_limits.da_gas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX], pi.gas_settings.gas_limits.l2_gas);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX],
              pi.gas_settings.teardown_gas_limits.da_gas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX],
              pi.gas_settings.teardown_gas_limits.l2_gas);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX],
              pi.gas_settings.max_fees_per_gas.fee_per_da_gas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX],
              pi.gas_settings.max_fees_per_gas.fee_per_l2_gas);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX],
              pi.gas_settings.max_priority_fees_per_gas.fee_per_da_gas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX],
              pi.gas_settings.max_priority_fees_per_gas.fee_per_l2_gas);

    // Fee payer
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX], pi.fee_payer);

    // Public Call Request Array Lengths
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX],
              pi.public_call_request_array_lengths.setup_calls);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX],
              pi.public_call_request_array_lengths.app_logic_calls);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX],
              static_cast<uint8_t>(pi.public_call_request_array_lengths.teardown_call));

    // Public call requests (testing use of all 4 columns)
    size_t setup_row = AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX;
    EXPECT_EQ(flat[col0_offset + setup_row], pi.public_setup_call_requests[0].msg_sender);
    EXPECT_EQ(flat[col1_offset + setup_row], pi.public_setup_call_requests[0].contract_address);
    EXPECT_EQ(flat[col2_offset + setup_row], static_cast<uint8_t>(pi.public_setup_call_requests[0].is_static_call));
    EXPECT_EQ(flat[col3_offset + setup_row], pi.public_setup_call_requests[0].calldata_hash);

    size_t app_logic_row = AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX + 1; // Using the second one
    EXPECT_EQ(flat[col0_offset + app_logic_row], pi.public_app_logic_call_requests[1].msg_sender);
    EXPECT_EQ(flat[col1_offset + app_logic_row], pi.public_app_logic_call_requests[1].contract_address);
    EXPECT_EQ(flat[col2_offset + app_logic_row],
              static_cast<uint8_t>(pi.public_app_logic_call_requests[1].is_static_call));
    EXPECT_EQ(flat[col3_offset + app_logic_row], pi.public_app_logic_call_requests[1].calldata_hash);

    size_t teardown_row = AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX;
    EXPECT_EQ(flat[col0_offset + teardown_row], pi.public_teardown_call_request.msg_sender);
    EXPECT_EQ(flat[col1_offset + teardown_row], pi.public_teardown_call_request.contract_address);
    EXPECT_EQ(flat[col2_offset + teardown_row], static_cast<uint8_t>(pi.public_teardown_call_request.is_static_call));
    EXPECT_EQ(flat[col3_offset + teardown_row], pi.public_teardown_call_request.calldata_hash);

    // Test previous accumulated data array lengths
    EXPECT_EQ(flat[col0_offset +
                   AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX],
              pi.previous_non_revertible_accumulated_data_array_lengths.note_hashes);
    EXPECT_EQ(
        flat[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX],
        pi.previous_non_revertible_accumulated_data_array_lengths.nullifiers);
    EXPECT_EQ(flat[col0_offset +
                   AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX],
              pi.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs);

    // Test previous revertible accumulated data array lengths
    EXPECT_EQ(
        flat[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX],
        pi.previous_revertible_accumulated_data_array_lengths.note_hashes);
    EXPECT_EQ(
        flat[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX],
        pi.previous_revertible_accumulated_data_array_lengths.nullifiers);
    EXPECT_EQ(
        flat[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX],
        pi.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs);

    // Accumulated Data Array Lengths
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX],
              pi.accumulated_data_array_lengths.note_hashes);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX],
              pi.accumulated_data_array_lengths.nullifiers);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX],
              pi.accumulated_data_array_lengths.l2_to_l1_msgs);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX],
              pi.accumulated_data_array_lengths.public_data_writes);

    // Test l2_to_l1_msgs (which use 3 columns)
    size_t l2_to_l1_msg_row = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX;
    EXPECT_EQ(flat[col0_offset + l2_to_l1_msg_row],
              pi.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].message.recipient);
    EXPECT_EQ(flat[col1_offset + l2_to_l1_msg_row],
              pi.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].message.content);
    EXPECT_EQ(flat[col2_offset + l2_to_l1_msg_row],
              pi.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].contract_address);

    // End tree snapshots
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.end_tree_snapshots.l1_to_l2_message_tree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.end_tree_snapshots.l1_to_l2_message_tree.next_available_leaf_index);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.end_tree_snapshots.note_hash_tree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.end_tree_snapshots.note_hash_tree.next_available_leaf_index);

    // End gas used
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], pi.end_gas_used.da_gas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], pi.end_gas_used.l2_gas);

    // Test note hashes and nullifiers
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + 2],
              pi.accumulated_data.note_hashes[2]);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + 3],
              pi.accumulated_data.nullifiers[3]);

    // Test accumulated l2_to_l1_msgs
    size_t acc_l2_to_l1_msg_row = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + 1; // Using second one
    EXPECT_EQ(flat[col0_offset + acc_l2_to_l1_msg_row], pi.accumulated_data.l2_to_l1_msgs[1].message.recipient);
    EXPECT_EQ(flat[col1_offset + acc_l2_to_l1_msg_row], pi.accumulated_data.l2_to_l1_msgs[1].message.content);
    EXPECT_EQ(flat[col2_offset + acc_l2_to_l1_msg_row], pi.accumulated_data.l2_to_l1_msgs[1].contract_address);

    // Test public logs
    size_t public_logs_row = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX;
    // Header
    EXPECT_EQ(flat[col0_offset + public_logs_row], pi.accumulated_data.public_logs.length);
    // Payload
    for (size_t j = 0; j < 3; ++j) {
        EXPECT_EQ(flat[col0_offset + public_logs_row + FLAT_PUBLIC_LOGS_HEADER_LENGTH + j],
                  pi.accumulated_data.public_logs.payload[j]);
    }

    // Public data writes (uses 2 columns)
    size_t public_data_write_row = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX + 1;
    EXPECT_EQ(flat[col0_offset + public_data_write_row], pi.accumulated_data.public_data_writes[1].leaf_slot);
    EXPECT_EQ(flat[col1_offset + public_data_write_row], pi.accumulated_data.public_data_writes[1].value);

    // Transaction fee
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX], pi.transaction_fee);

    // Reverted status
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX], static_cast<uint8_t>(pi.reverted));
}

} // namespace
} // namespace bb::avm2
