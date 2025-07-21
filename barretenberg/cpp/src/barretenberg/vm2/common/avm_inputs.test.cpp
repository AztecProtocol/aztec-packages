#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/avm_inputs.hpp"

#include <cstdint>

#include "barretenberg/api/file_io.hpp"
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

    ASSERT_THAT(as_cols, SizeIs(AVM_NUM_PUBLIC_INPUT_COLUMNS));
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
    pi.globalVariables.chainId = 123;
    pi.globalVariables.version = 456;
    pi.globalVariables.blockNumber = 12345;
    pi.globalVariables.slotNumber = 67890;
    pi.globalVariables.timestamp = 789000;
    pi.globalVariables.coinbase = 123123;
    pi.globalVariables.feeRecipient = 9876;

    // Set gas fees
    pi.globalVariables.gasFees.feePerDaGas = 111;
    pi.globalVariables.gasFees.feePerL2Gas = 222;

    // Set start tree snapshots
    pi.startTreeSnapshots.l1ToL2MessageTree.root = 1000;
    pi.startTreeSnapshots.l1ToL2MessageTree.nextAvailableLeafIndex = 2000;
    pi.startTreeSnapshots.noteHashTree.root = 3000;
    pi.startTreeSnapshots.noteHashTree.nextAvailableLeafIndex = 4000;
    pi.startTreeSnapshots.nullifierTree.root = 5000;
    pi.startTreeSnapshots.nullifierTree.nextAvailableLeafIndex = 6000;
    pi.startTreeSnapshots.publicDataTree.root = 7000;
    pi.startTreeSnapshots.publicDataTree.nextAvailableLeafIndex = 8000;

    // Set gas used
    pi.startGasUsed.daGas = 100;
    pi.startGasUsed.l2Gas = 200;

    // Set gas settings
    pi.gasSettings.gasLimits.daGas = 1234;
    pi.gasSettings.gasLimits.l2Gas = 5678;
    pi.gasSettings.teardownGasLimits.daGas = 9012;
    pi.gasSettings.teardownGasLimits.l2Gas = 3456;
    pi.gasSettings.maxFeesPerGas.feePerDaGas = 7890;
    pi.gasSettings.maxFeesPerGas.feePerL2Gas = 1234;
    pi.gasSettings.maxPriorityFeesPerGas.feePerDaGas = 5678;
    pi.gasSettings.maxPriorityFeesPerGas.feePerL2Gas = 9012;

    // Set fee payer
    pi.feePayer = 12345;

    // Set Public Call Request Array Lengths
    pi.publicCallRequestArrayLengths.setupCalls = 2;
    pi.publicCallRequestArrayLengths.appLogicCalls = 3;
    pi.publicCallRequestArrayLengths.teardownCall = true;

    // Set call requests (using all 4 columns)
    pi.publicSetupCallRequests[0].msgSender = 1111;
    pi.publicSetupCallRequests[0].contractAddress = 2222;
    pi.publicSetupCallRequests[0].isStaticCall = true;
    pi.publicSetupCallRequests[0].calldataHash = 3333;

    pi.publicAppLogicCallRequests[1].msgSender = 4444;
    pi.publicAppLogicCallRequests[1].contractAddress = 5555;
    pi.publicAppLogicCallRequests[1].isStaticCall = false;
    pi.publicAppLogicCallRequests[1].calldataHash = 6666;

    pi.publicTeardownCallRequest.msgSender = 7777;
    pi.publicTeardownCallRequest.contractAddress = 8888;
    pi.publicTeardownCallRequest.isStaticCall = true;
    pi.publicTeardownCallRequest.calldataHash = 9999;

    // Set accumulated data array lengths
    pi.previousNonRevertibleAccumulatedDataArrayLengths.noteHashes = 10;
    pi.previousNonRevertibleAccumulatedDataArrayLengths.nullifiers = 20;
    pi.previousNonRevertibleAccumulatedDataArrayLengths.l2ToL1Msgs = 30;

    pi.previousRevertibleAccumulatedDataArrayLengths.noteHashes = 40;
    pi.previousRevertibleAccumulatedDataArrayLengths.nullifiers = 50;
    pi.previousRevertibleAccumulatedDataArrayLengths.l2ToL1Msgs = 60;

    // Set l2 to l1 messages (using 3 columns)
    pi.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].message.recipient = 1234;
    pi.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].message.content = 1357;
    pi.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].contractAddress = 3579;

    // Set accumulated data elements
    pi.accumulatedData.noteHashes[2] = 54321;
    pi.accumulatedData.nullifiers[3] = 98765;

    // Set l2 to l1 messages in accumulated data
    pi.accumulatedData.l2ToL1Msgs[1].message.recipient = 3333;
    pi.accumulatedData.l2ToL1Msgs[1].message.content = 7531;
    pi.accumulatedData.l2ToL1Msgs[1].contractAddress = 9753;

    // Set public logs (spans multiple rows per log)
    pi.accumulatedData.publicLogs[0].contractAddress = 11223;
    pi.accumulatedData.publicLogs[0].emittedLength = PUBLIC_LOG_SIZE_IN_FIELDS;
    for (size_t j = 0; j < PUBLIC_LOG_SIZE_IN_FIELDS; ++j) {
        pi.accumulatedData.publicLogs[0].fields[j] = 10000 + j;
    }

    // Set public data writes
    pi.accumulatedData.publicDataWrites[1].leafSlot = 5555;
    pi.accumulatedData.publicDataWrites[1].value = 6666;

    // Set end gas used
    pi.endGasUsed.daGas = 5000;
    pi.endGasUsed.l2Gas = 7000;

    // Set end tree snapshots
    pi.endTreeSnapshots.l1ToL2MessageTree.root = 10000;
    pi.endTreeSnapshots.l1ToL2MessageTree.nextAvailableLeafIndex = 20000;
    pi.endTreeSnapshots.noteHashTree.root = 30000;
    pi.endTreeSnapshots.noteHashTree.nextAvailableLeafIndex = 40000;
    pi.endTreeSnapshots.nullifierTree.root = 50000;
    pi.endTreeSnapshots.nullifierTree.nextAvailableLeafIndex = 60000;
    pi.endTreeSnapshots.publicDataTree.root = 70000;
    pi.endTreeSnapshots.publicDataTree.nextAvailableLeafIndex = 80000;

    // Set transaction fee
    pi.transactionFee = 9876;

    // Set accumulated data array lengths
    pi.accumulatedDataArrayLengths.noteHashes = 3;
    pi.accumulatedDataArrayLengths.nullifiers = 4;
    pi.accumulatedDataArrayLengths.l2ToL1Msgs = 2;
    pi.accumulatedDataArrayLengths.publicLogs = 1;
    pi.accumulatedDataArrayLengths.publicDataWrites = 5;

    // Set reverted flag
    pi.reverted = true;

    // Get the columns representation
    auto columns = pi.to_columns();

    // Convert to flat array for easier testing
    auto flat = PublicInputs::columns_to_flat(columns);
    ASSERT_THAT(flat, SizeIs(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH));

    // Define column offsets based on the total number of rows per column
    const size_t col0_offset = 0;
    const size_t col1_offset = static_cast<size_t>(AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    const size_t col2_offset = static_cast<size_t>(2 * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    const size_t col3_offset = static_cast<size_t>(3 * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    // Verify that some specific values are at the expected positions

    // Global variables
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX], pi.globalVariables.chainId);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX], pi.globalVariables.version);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX],
              pi.globalVariables.blockNumber);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX],
              pi.globalVariables.slotNumber);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX], pi.globalVariables.timestamp);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX],
              pi.globalVariables.feeRecipient);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX],
              pi.globalVariables.gasFees.feePerDaGas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX],
              pi.globalVariables.gasFees.feePerL2Gas);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX], pi.globalVariables.coinbase);

    // Start tree snapshots
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.startTreeSnapshots.l1ToL2MessageTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.startTreeSnapshots.l1ToL2MessageTree.nextAvailableLeafIndex);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.startTreeSnapshots.noteHashTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.startTreeSnapshots.noteHashTree.nextAvailableLeafIndex);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX],
              pi.startTreeSnapshots.nullifierTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX],
              pi.startTreeSnapshots.nullifierTree.nextAvailableLeafIndex);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX],
              pi.startTreeSnapshots.publicDataTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX],
              pi.startTreeSnapshots.publicDataTree.nextAvailableLeafIndex);

    // Gas used
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX], pi.startGasUsed.daGas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX], pi.startGasUsed.l2Gas);

    // Gas settings
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX], pi.gasSettings.gasLimits.daGas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX], pi.gasSettings.gasLimits.l2Gas);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX],
              pi.gasSettings.teardownGasLimits.daGas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX],
              pi.gasSettings.teardownGasLimits.l2Gas);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX],
              pi.gasSettings.maxFeesPerGas.feePerDaGas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX],
              pi.gasSettings.maxFeesPerGas.feePerL2Gas);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX],
              pi.gasSettings.maxPriorityFeesPerGas.feePerDaGas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX],
              pi.gasSettings.maxPriorityFeesPerGas.feePerL2Gas);

    // Fee payer
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX], pi.feePayer);

    // Public Call Request Array Lengths
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX],
              pi.publicCallRequestArrayLengths.setupCalls);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX],
              pi.publicCallRequestArrayLengths.appLogicCalls);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX],
              static_cast<uint8_t>(pi.publicCallRequestArrayLengths.teardownCall));

    // Public call requests (testing use of all 4 columns)
    size_t setup_row = AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX;
    EXPECT_EQ(flat[col0_offset + setup_row], pi.publicSetupCallRequests[0].msgSender);
    EXPECT_EQ(flat[col1_offset + setup_row], pi.publicSetupCallRequests[0].contractAddress);
    EXPECT_EQ(flat[col2_offset + setup_row], static_cast<uint8_t>(pi.publicSetupCallRequests[0].isStaticCall));
    EXPECT_EQ(flat[col3_offset + setup_row], pi.publicSetupCallRequests[0].calldataHash);

    size_t app_logic_row = AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX + 1; // Using the second one
    EXPECT_EQ(flat[col0_offset + app_logic_row], pi.publicAppLogicCallRequests[1].msgSender);
    EXPECT_EQ(flat[col1_offset + app_logic_row], pi.publicAppLogicCallRequests[1].contractAddress);
    EXPECT_EQ(flat[col2_offset + app_logic_row], static_cast<uint8_t>(pi.publicAppLogicCallRequests[1].isStaticCall));
    EXPECT_EQ(flat[col3_offset + app_logic_row], pi.publicAppLogicCallRequests[1].calldataHash);

    size_t teardown_row = AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX;
    EXPECT_EQ(flat[col0_offset + teardown_row], pi.publicTeardownCallRequest.msgSender);
    EXPECT_EQ(flat[col1_offset + teardown_row], pi.publicTeardownCallRequest.contractAddress);
    EXPECT_EQ(flat[col2_offset + teardown_row], static_cast<uint8_t>(pi.publicTeardownCallRequest.isStaticCall));
    EXPECT_EQ(flat[col3_offset + teardown_row], pi.publicTeardownCallRequest.calldataHash);

    // Test previous accumulated data array lengths
    EXPECT_EQ(flat[col0_offset +
                   AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX],
              pi.previousNonRevertibleAccumulatedDataArrayLengths.noteHashes);
    EXPECT_EQ(
        flat[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX],
        pi.previousNonRevertibleAccumulatedDataArrayLengths.nullifiers);
    EXPECT_EQ(flat[col0_offset +
                   AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX],
              pi.previousNonRevertibleAccumulatedDataArrayLengths.l2ToL1Msgs);

    // Test previous revertible accumulated data array lengths
    EXPECT_EQ(
        flat[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX],
        pi.previousRevertibleAccumulatedDataArrayLengths.noteHashes);
    EXPECT_EQ(
        flat[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX],
        pi.previousRevertibleAccumulatedDataArrayLengths.nullifiers);
    EXPECT_EQ(
        flat[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX],
        pi.previousRevertibleAccumulatedDataArrayLengths.l2ToL1Msgs);

    // Accumulated Data Array Lengths
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX],
              pi.accumulatedDataArrayLengths.noteHashes);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX],
              pi.accumulatedDataArrayLengths.nullifiers);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX],
              pi.accumulatedDataArrayLengths.l2ToL1Msgs);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_LOGS_ROW_IDX],
              pi.accumulatedDataArrayLengths.publicLogs);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX],
              pi.accumulatedDataArrayLengths.publicDataWrites);

    // Test l2ToL1Msgs (which use 3 columns)
    size_t l2_to_l1_msg_row = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX;
    EXPECT_EQ(flat[col0_offset + l2_to_l1_msg_row],
              pi.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].message.recipient);
    EXPECT_EQ(flat[col1_offset + l2_to_l1_msg_row],
              pi.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].message.content);
    EXPECT_EQ(flat[col2_offset + l2_to_l1_msg_row],
              pi.previousNonRevertibleAccumulatedData.l2ToL1Msgs[0].contractAddress);

    // End tree snapshots
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.endTreeSnapshots.l1ToL2MessageTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.endTreeSnapshots.l1ToL2MessageTree.nextAvailableLeafIndex);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.endTreeSnapshots.noteHashTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.endTreeSnapshots.noteHashTree.nextAvailableLeafIndex);

    // End gas used
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], pi.endGasUsed.daGas);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], pi.endGasUsed.l2Gas);

    // Test note hashes and nullifiers
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + 2],
              pi.accumulatedData.noteHashes[2]);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + 3],
              pi.accumulatedData.nullifiers[3]);

    // Test accumulated l2ToL1Msgs
    size_t acc_l2_to_l1_msg_row = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + 1; // Using second one
    EXPECT_EQ(flat[col0_offset + acc_l2_to_l1_msg_row], pi.accumulatedData.l2ToL1Msgs[1].message.recipient);
    EXPECT_EQ(flat[col1_offset + acc_l2_to_l1_msg_row], pi.accumulatedData.l2ToL1Msgs[1].message.content);
    EXPECT_EQ(flat[col2_offset + acc_l2_to_l1_msg_row], pi.accumulatedData.l2ToL1Msgs[1].contractAddress);

    // Test public logs
    size_t first_log_row = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX;
    for (size_t j = 0; j < 3; ++j) {
        EXPECT_EQ(flat[col0_offset + first_log_row + j], pi.accumulatedData.publicLogs[0].contractAddress);
        EXPECT_EQ(flat[col1_offset + first_log_row + j], pi.accumulatedData.publicLogs[0].emittedLength);
        EXPECT_EQ(flat[col2_offset + first_log_row + j], pi.accumulatedData.publicLogs[0].fields[j]);
    }

    // Public data writes (uses 2 columns)
    size_t public_data_write_row = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX + 1;
    EXPECT_EQ(flat[col0_offset + public_data_write_row], pi.accumulatedData.publicDataWrites[1].leafSlot);
    EXPECT_EQ(flat[col1_offset + public_data_write_row], pi.accumulatedData.publicDataWrites[1].value);

    // Transaction fee
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX], pi.transactionFee);

    // Reverted status
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX], static_cast<uint8_t>(pi.reverted));
}

} // namespace
} // namespace bb::avm2
