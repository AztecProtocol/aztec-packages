#include "barretenberg/vm2/common/avm_inputs.hpp"

#include <vector>

#include "barretenberg/serialize/msgpack.hpp"

namespace bb::avm2 {
namespace {

/////////////////////////////////////////////////////////
/// Internal helpers for serialization to columns
/// (in anonymous namespace)
/////////////////////////////////////////////////////////

void set_snapshot_in_cols(const AppendOnlyTreeSnapshot& snapshot, std::vector<std::vector<FF>>& cols, size_t row_idx)
{
    cols[0][row_idx] = snapshot.root;
    cols[1][row_idx] = snapshot.nextAvailableLeafIndex;
}

void set_gas_in_cols(const Gas& gas, std::vector<std::vector<FF>>& cols, size_t row_idx)
{
    cols[0][row_idx] = gas.daGas;
    cols[1][row_idx] = gas.l2Gas;
}

void set_gas_fees_in_cols(const GasFees& gas_fees, std::vector<std::vector<FF>>& cols, size_t row_idx)
{
    cols[0][row_idx] = gas_fees.feePerDaGas;
    cols[1][row_idx] = gas_fees.feePerL2Gas;
}

void set_public_call_request_in_cols(const PublicCallRequest& request,
                                     std::vector<std::vector<FF>>& cols,
                                     size_t row_idx)
{
    cols[0][row_idx] = request.msgSender;
    cols[1][row_idx] = request.contractAddress;
    cols[2][row_idx] = static_cast<uint8_t>(request.isStaticCall);
    cols[3][row_idx] = request.calldataHash;
}

void set_public_call_request_array_in_cols(const std::array<PublicCallRequest, MAX_ENQUEUED_CALLS_PER_TX>& requests,
                                           std::vector<std::vector<FF>>& cols,
                                           size_t array_start_row_idx)
{
    for (size_t i = 0; i < requests.size(); ++i) {
        size_t row = array_start_row_idx + i;
        set_public_call_request_in_cols(requests[i], cols, row);
    }
}

template <size_t SIZE>
void set_field_array_in_cols(const std::array<FF, SIZE>& arr,
                             std::vector<std::vector<FF>>& cols,
                             size_t array_start_row_idx)
{
    for (size_t i = 0; i < arr.size(); ++i) {
        size_t row = array_start_row_idx + i;
        cols[0][row] = arr[i];
    }
}

template <size_t SIZE>
void set_l2_to_l1_msg_array_in_cols(const std::array<ScopedL2ToL1Message, SIZE>& arr,
                                    std::vector<std::vector<FF>>& cols,
                                    size_t array_start_row_idx)
{
    for (size_t i = 0; i < arr.size(); ++i) {
        size_t row = array_start_row_idx + i;
        cols[0][row] = arr[i].message.recipient;
        cols[1][row] = arr[i].message.content;
        cols[2][row] = arr[i].contractAddress;
    }
}

template <size_t SIZE>
void set_public_logs_in_cols(const std::array<PublicLog, SIZE>& logs,
                             std::vector<std::vector<FF>>& cols,
                             size_t array_start_row_idx)
{
    for (size_t i = 0; i < logs.size(); ++i) {
        size_t first_row_for_log = array_start_row_idx + (i * PUBLIC_LOG_SIZE_IN_FIELDS);
        for (size_t j = 0; j < PUBLIC_LOG_SIZE_IN_FIELDS; ++j) {
            // always set contract address in col 0 so that some entry in the row is always non-zero
            cols[0][first_row_for_log + j] = logs[i].contractAddress;
            cols[1][first_row_for_log + j] = logs[i].emittedLength;
            // and set the actual log data entry
            cols[2][first_row_for_log + j] = logs[i].fields[j];
        }
    }
}

template <size_t SIZE>
void set_public_data_writes_in_cols(const std::array<PublicDataWrite, SIZE>& writes,
                                    std::vector<std::vector<FF>>& cols,
                                    size_t array_start_row_idx)
{
    for (size_t i = 0; i < writes.size(); ++i) {
        size_t row = array_start_row_idx + i;
        cols[0][row] = writes[i].leafSlot;
        cols[1][row] = writes[i].value;
    }
}

} // anonymous namespace

/////////////////////////////////////////////////////////
/// Msgpack deserialization
/////////////////////////////////////////////////////////

PublicInputs PublicInputs::from(const std::vector<uint8_t>& data)
{
    PublicInputs inputs;
    msgpack::unpack(reinterpret_cast<const char*>(data.data()), data.size()).get().convert(inputs);
    return inputs;
}

AvmProvingInputs AvmProvingInputs::from(const std::vector<uint8_t>& data)
{
    AvmProvingInputs inputs;
    msgpack::unpack(reinterpret_cast<const char*>(data.data()), data.size()).get().convert(inputs);
    return inputs;
}

/////////////////////////////////////////////////////////
/// Serialization to columns
/////////////////////////////////////////////////////////

// WARNING: If updating this columns conversion, you must also update columns serialization
// in the Noir `AvmCircuitPublicInputs` struct in avm_circuit_public_inputs.nr
std::vector<std::vector<FF>> PublicInputs::to_columns() const
{
    std::vector<std::vector<FF>> cols(AVM_NUM_PUBLIC_INPUT_COLUMNS,
                                      std::vector<FF>(AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH, FF(0)));

    // Global variables
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX] = globalVariables.chainId;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX] = globalVariables.version;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX] = globalVariables.blockNumber;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX] = globalVariables.slotNumber;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX] = globalVariables.timestamp;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX] = globalVariables.coinbase;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX] = globalVariables.feeRecipient;
    set_gas_fees_in_cols(globalVariables.gasFees, cols, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX);

    // Start tree snapshots
    set_snapshot_in_cols(startTreeSnapshots.l1ToL2MessageTree,
                         cols,
                         AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX);
    set_snapshot_in_cols(
        startTreeSnapshots.noteHashTree, cols, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX);
    set_snapshot_in_cols(
        startTreeSnapshots.nullifierTree, cols, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX);
    set_snapshot_in_cols(
        startTreeSnapshots.publicDataTree, cols, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX);

    // Start gas used
    set_gas_in_cols(startGasUsed, cols, AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX);

    // Gas settings
    set_gas_in_cols(gasSettings.gasLimits, cols, AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX);
    set_gas_in_cols(gasSettings.teardownGasLimits, cols, AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX);
    set_gas_fees_in_cols(gasSettings.maxFeesPerGas, cols, AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX);
    set_gas_fees_in_cols(
        gasSettings.maxPriorityFeesPerGas, cols, AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX);

    // Effective gas fees
    set_gas_fees_in_cols(effectiveGasFees, cols, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_EFFECTIVE_GAS_FEES_ROW_IDX);

    // Fee payer
    cols[0][AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX] = feePayer;

    // Public Call Request Array Lengths
    cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX] =
        publicCallRequestArrayLengths.setupCalls;
    cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX] =
        publicCallRequestArrayLengths.appLogicCalls;
    cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX] =
        static_cast<uint8_t>(publicCallRequestArrayLengths.teardownCall);

    // Setup, app logic, and teardown call requests
    set_public_call_request_array_in_cols(
        publicSetupCallRequests, cols, AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX);
    set_public_call_request_array_in_cols(
        publicAppLogicCallRequests, cols, AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX);
    set_public_call_request_in_cols(
        publicTeardownCallRequest, cols, AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX);

    // Previous non-revertible accumulated data array lengths
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] =
        previousNonRevertibleAccumulatedDataArrayLengths.noteHashes;
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] =
        previousNonRevertibleAccumulatedDataArrayLengths.nullifiers;
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] =
        previousNonRevertibleAccumulatedDataArrayLengths.l2ToL1Msgs;

    // Previous revertible accumulated data array lengths
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] =
        previousRevertibleAccumulatedDataArrayLengths.noteHashes;
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] =
        previousRevertibleAccumulatedDataArrayLengths.nullifiers;
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] =
        previousRevertibleAccumulatedDataArrayLengths.l2ToL1Msgs;

    // Previous non-revertible accumulated data
    set_field_array_in_cols(previousNonRevertibleAccumulatedData.noteHashes,
                            cols,
                            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX);
    set_field_array_in_cols(previousNonRevertibleAccumulatedData.nullifiers,
                            cols,
                            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX);
    set_l2_to_l1_msg_array_in_cols(previousNonRevertibleAccumulatedData.l2ToL1Msgs,
                                   cols,
                                   AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX);

    // Previous revertible accumulated data
    set_field_array_in_cols(previousRevertibleAccumulatedData.noteHashes,
                            cols,
                            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX);
    set_field_array_in_cols(previousRevertibleAccumulatedData.nullifiers,
                            cols,
                            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX);
    set_l2_to_l1_msg_array_in_cols(previousRevertibleAccumulatedData.l2ToL1Msgs,
                                   cols,
                                   AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX);

    // End tree snapshots
    set_snapshot_in_cols(
        endTreeSnapshots.l1ToL2MessageTree, cols, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX);
    set_snapshot_in_cols(
        endTreeSnapshots.noteHashTree, cols, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX);
    set_snapshot_in_cols(
        endTreeSnapshots.nullifierTree, cols, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX);
    set_snapshot_in_cols(
        endTreeSnapshots.publicDataTree, cols, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX);

    // End gas used
    set_gas_in_cols(endGasUsed, cols, AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX);

    // Accumulated Data Array Lengths
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] =
        accumulatedDataArrayLengths.noteHashes;
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] =
        accumulatedDataArrayLengths.nullifiers;
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] =
        accumulatedDataArrayLengths.l2ToL1Msgs;
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_LOGS_ROW_IDX] =
        accumulatedDataArrayLengths.publicLogs;
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX] =
        accumulatedDataArrayLengths.publicDataWrites;

    // Accumulated data
    set_field_array_in_cols(
        accumulatedData.noteHashes, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX);
    set_field_array_in_cols(
        accumulatedData.nullifiers, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX);
    set_l2_to_l1_msg_array_in_cols(
        accumulatedData.l2ToL1Msgs, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX);
    set_public_logs_in_cols(
        accumulatedData.publicLogs, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX);
    set_public_data_writes_in_cols(
        accumulatedData.publicDataWrites, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX);

    // Transaction fee
    cols[0][AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX] = transactionFee;

    // Reverted
    cols[0][AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX] = static_cast<uint8_t>(reverted);

    return cols;
}

std::vector<FF> PublicInputs::columns_to_flat(std::vector<std::vector<FF>> const& columns)
{
    std::vector<FF> flat;
    for (const auto& col : columns) {
        if (col.size() != AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH) {
            throw std::invalid_argument("Public inputs column size does not match the expected max length.");
        }
        flat.insert(flat.end(), col.begin(), col.end());
    }
    return flat;
}

} // namespace bb::avm2
