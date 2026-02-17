#include "barretenberg/vm2/common/avm_io.hpp"

#include <vector>

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2 {
namespace {

/////////////////////////////////////////////////////////
/// Internal helpers for serialization to columns
/// (in anonymous namespace)
/////////////////////////////////////////////////////////

void set_snapshot_in_cols(const AppendOnlyTreeSnapshot& snapshot, std::vector<std::vector<FF>>& cols, size_t row_idx)
{
    cols[0][row_idx] = snapshot.root;
    cols[1][row_idx] = snapshot.next_available_leaf_index;
}

void set_gas_in_cols(const Gas& gas, std::vector<std::vector<FF>>& cols, size_t row_idx)
{
    cols[0][row_idx] = gas.da_gas;
    cols[1][row_idx] = gas.l2_gas;
}

void set_gas_fees_in_cols(const GasFees& gas_fees, std::vector<std::vector<FF>>& cols, size_t row_idx)
{
    cols[0][row_idx] = gas_fees.fee_per_da_gas;
    cols[1][row_idx] = gas_fees.fee_per_l2_gas;
}

void set_public_call_request_in_cols(const PublicCallRequest& request,
                                     std::vector<std::vector<FF>>& cols,
                                     size_t row_idx)
{
    cols[0][row_idx] = request.msg_sender;
    cols[1][row_idx] = request.contract_address;
    cols[2][row_idx] = static_cast<uint8_t>(request.is_static_call);
    cols[3][row_idx] = request.calldata_hash;
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
        cols[2][row] = arr[i].contract_address;
    }
}

void set_public_logs_in_cols(const PublicLogs& public_logs,
                             std::vector<std::vector<FF>>& cols,
                             size_t array_start_row_idx)
{
    // Header
    cols[0][array_start_row_idx] = public_logs.length;
    // Payload
    for (size_t i = 0; i < public_logs.length; ++i) {
        cols[0][array_start_row_idx + i + FLAT_PUBLIC_LOGS_HEADER_LENGTH] = public_logs.payload[i];
    }
}

template <size_t SIZE>
void set_public_data_writes_in_cols(const std::array<PublicDataWrite, SIZE>& writes,
                                    std::vector<std::vector<FF>>& cols,
                                    size_t array_start_row_idx)
{
    for (size_t i = 0; i < writes.size(); ++i) {
        size_t row = array_start_row_idx + i;
        cols[0][row] = writes[i].leaf_slot;
        cols[1][row] = writes[i].value;
    }
}

void set_protocol_contracts_in_cols(const ProtocolContracts& protocol_contracts,
                                    std::vector<std::vector<FF>>& cols,
                                    size_t protocol_contracts_start_row_idx)
{
    set_field_array_in_cols(protocol_contracts.derived_addresses, cols, protocol_contracts_start_row_idx);
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

AvmFastSimulationInputs AvmFastSimulationInputs::from(const std::vector<uint8_t>& data)
{
    AvmFastSimulationInputs inputs;
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
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX] = global_variables.chain_id;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX] = global_variables.version;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX] = global_variables.block_number;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX] = global_variables.slot_number;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX] = global_variables.timestamp;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX] = global_variables.coinbase;
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX] = global_variables.fee_recipient;
    set_gas_fees_in_cols(global_variables.gas_fees, cols, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX);

    // Protocol contracts
    set_protocol_contracts_in_cols(protocol_contracts, cols, AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACTS_ROW_IDX);

    // Start tree snapshots
    set_snapshot_in_cols(start_tree_snapshots.l1_to_l2_message_tree,
                         cols,
                         AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX);
    set_snapshot_in_cols(
        start_tree_snapshots.note_hash_tree, cols, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX);
    set_snapshot_in_cols(
        start_tree_snapshots.nullifier_tree, cols, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX);
    set_snapshot_in_cols(
        start_tree_snapshots.public_data_tree, cols, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX);

    // Start gas used
    set_gas_in_cols(start_gas_used, cols, AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX);

    // Gas settings
    set_gas_in_cols(gas_settings.gas_limits, cols, AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX);
    set_gas_in_cols(gas_settings.teardown_gas_limits, cols, AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX);
    set_gas_fees_in_cols(gas_settings.max_fees_per_gas, cols, AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX);
    set_gas_fees_in_cols(
        gas_settings.max_priority_fees_per_gas, cols, AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX);

    // Effective gas fees
    set_gas_fees_in_cols(effective_gas_fees, cols, AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX);

    // Fee payer
    cols[0][AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX] = fee_payer;

    // Prover id
    cols[0][AVM_PUBLIC_INPUTS_PROVER_ID_ROW_IDX] = prover_id;

    // Public Call Request Array Lengths
    cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX] =
        public_call_request_array_lengths.setup_calls;
    cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX] =
        public_call_request_array_lengths.app_logic_calls;
    cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX] =
        static_cast<uint8_t>(public_call_request_array_lengths.teardown_call);

    // Setup, app logic, and teardown call requests
    set_public_call_request_array_in_cols(
        public_setup_call_requests, cols, AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX);
    set_public_call_request_array_in_cols(
        public_app_logic_call_requests, cols, AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX);
    set_public_call_request_in_cols(
        public_teardown_call_request, cols, AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX);

    // Previous non-revertible accumulated data array lengths
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] =
        previous_non_revertible_accumulated_data_array_lengths.note_hashes;
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] =
        previous_non_revertible_accumulated_data_array_lengths.nullifiers;
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] =
        previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs;

    // Previous revertible accumulated data array lengths
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] =
        previous_revertible_accumulated_data_array_lengths.note_hashes;
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] =
        previous_revertible_accumulated_data_array_lengths.nullifiers;
    cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] =
        previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs;

    // Previous non-revertible accumulated data
    set_field_array_in_cols(previous_non_revertible_accumulated_data.note_hashes,
                            cols,
                            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX);
    set_field_array_in_cols(previous_non_revertible_accumulated_data.nullifiers,
                            cols,
                            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX);
    set_l2_to_l1_msg_array_in_cols(previous_non_revertible_accumulated_data.l2_to_l1_msgs,
                                   cols,
                                   AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX);

    // Previous revertible accumulated data
    set_field_array_in_cols(previous_revertible_accumulated_data.note_hashes,
                            cols,
                            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX);
    set_field_array_in_cols(previous_revertible_accumulated_data.nullifiers,
                            cols,
                            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX);
    set_l2_to_l1_msg_array_in_cols(previous_revertible_accumulated_data.l2_to_l1_msgs,
                                   cols,
                                   AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX);

    // End tree snapshots
    set_snapshot_in_cols(end_tree_snapshots.l1_to_l2_message_tree,
                         cols,
                         AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX);
    set_snapshot_in_cols(
        end_tree_snapshots.note_hash_tree, cols, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX);
    set_snapshot_in_cols(
        end_tree_snapshots.nullifier_tree, cols, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX);
    set_snapshot_in_cols(
        end_tree_snapshots.public_data_tree, cols, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX);

    // End gas used
    set_gas_in_cols(end_gas_used, cols, AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX);

    // Accumulated Data Array Lengths
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] =
        accumulated_data_array_lengths.note_hashes;
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] =
        accumulated_data_array_lengths.nullifiers;
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] =
        accumulated_data_array_lengths.l2_to_l1_msgs;
    cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX] =
        accumulated_data_array_lengths.public_data_writes;

    // Accumulated data
    set_field_array_in_cols(
        accumulated_data.note_hashes, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX);
    set_field_array_in_cols(
        accumulated_data.nullifiers, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX);
    set_l2_to_l1_msg_array_in_cols(
        accumulated_data.l2_to_l1_msgs, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX);
    set_public_logs_in_cols(
        accumulated_data.public_logs, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX);
    set_public_data_writes_in_cols(
        accumulated_data.public_data_writes, cols, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX);

    // Transaction fee
    cols[0][AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX] = transaction_fee;

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
