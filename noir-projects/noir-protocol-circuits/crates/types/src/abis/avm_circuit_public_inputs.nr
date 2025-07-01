use crate::{
    abis::{
        accumulated_data::{
            avm_accumulated_data::{AvmAccumulatedData, AvmAccumulatedDataArrayLengths},
            private_to_avm_accumulated_data::{
                PrivateToAvmAccumulatedData, PrivateToAvmAccumulatedDataArrayLengths,
            },
        },
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        gas::Gas,
        gas_fees::GasFees,
        gas_settings::GasSettings,
        global_variables::GlobalVariables,
        public_call_request::{PublicCallRequest, PublicCallRequestArrayLengths},
        public_data_write::PublicDataWrite,
        public_log::PublicLog,
        side_effect::scoped::Scoped,
        tree_snapshots::TreeSnapshots,
    },
    address::{AztecAddress, EthAddress},
    constants::{
        AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH, AVM_NUM_PUBLIC_INPUT_COLUMNS,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_LOGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX,
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH,
        AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX, AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX,
        AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX, AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX,
        AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX,
        AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX,
        AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX,
        AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX,
        AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX,
        AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX,
        AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX,
        AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX,
        AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX,
        AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX,
        AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX,
        AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX, AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX,
        AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX,
        AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
        AVM_VK_INDEX, MAX_ENQUEUED_CALLS_PER_TX, PROOF_TYPE_AVM, PUBLIC_LOG_SIZE_IN_FIELDS,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    proof::{avm_proof::AvmProof, traits::Verifiable, vk_data::VkData},
    traits::{Deserialize, Empty, Serialize},
};

use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct AvmCircuitPublicInputs {
    ///////////////////////////////////
    // Inputs.
    pub global_variables: GlobalVariables,
    pub start_tree_snapshots: TreeSnapshots,
    pub start_gas_used: Gas,
    pub gas_settings: GasSettings,
    pub effective_gas_fees: GasFees,
    pub fee_payer: AztecAddress,
    pub public_call_request_array_lengths: PublicCallRequestArrayLengths,
    pub public_setup_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
    pub public_app_logic_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
    pub public_teardown_call_request: PublicCallRequest,
    pub previous_non_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths,
    pub previous_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths,
    pub previous_non_revertible_accumulated_data: PrivateToAvmAccumulatedData,
    pub previous_revertible_accumulated_data: PrivateToAvmAccumulatedData,

    ///////////////////////////////////
    // Outputs.
    pub end_tree_snapshots: TreeSnapshots,
    pub end_gas_used: Gas,
    pub accumulated_data_array_lengths: AvmAccumulatedDataArrayLengths,
    pub accumulated_data: AvmAccumulatedData,
    pub transaction_fee: Field,
    pub reverted: bool,
}

impl Empty for AvmCircuitPublicInputs {
    fn empty() -> Self {
        AvmCircuitPublicInputs {
            global_variables: GlobalVariables::empty(),
            start_tree_snapshots: TreeSnapshots::empty(),
            start_gas_used: Gas::empty(),
            gas_settings: GasSettings::empty(),
            effective_gas_fees: GasFees::empty(),
            fee_payer: AztecAddress::zero(),
            public_call_request_array_lengths: PublicCallRequestArrayLengths::empty(),
            public_setup_call_requests: [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            public_app_logic_call_requests: [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            public_teardown_call_request: PublicCallRequest::empty(),
            previous_non_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths::empty(),
            previous_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths::empty(),
            previous_non_revertible_accumulated_data: PrivateToAvmAccumulatedData::empty(),
            previous_revertible_accumulated_data: PrivateToAvmAccumulatedData::empty(),
            end_tree_snapshots: TreeSnapshots::empty(),
            end_gas_used: Gas::empty(),
            accumulated_data_array_lengths: AvmAccumulatedDataArrayLengths::empty(),
            accumulated_data: AvmAccumulatedData::empty(),
            transaction_fee: 0,
            reverted: false,
        }
    }
}

/////////////////////////////////////////////////////////
/// Helpers for serialization to columns.
/////////////////////////////////////////////////////////

fn set_snapshot_in_cols(
    snapshot: AppendOnlyTreeSnapshot,
    cols: &mut [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS],
    row_idx: u32,
) {
    cols[0][row_idx] = snapshot.root;
    cols[1][row_idx] = snapshot.next_available_leaf_index as Field;
}
fn set_gas_in_cols(
    gas: Gas,
    cols: &mut [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS],
    row_idx: u32,
) {
    cols[0][row_idx] = gas.da_gas as Field;
    cols[1][row_idx] = gas.l2_gas as Field;
}

fn set_gas_fees_in_cols(
    gas_fees: GasFees,
    cols: &mut [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS],
    row_idx: u32,
) {
    cols[0][row_idx] = gas_fees.fee_per_da_gas as Field;
    cols[1][row_idx] = gas_fees.fee_per_l2_gas as Field;
}

fn set_public_call_request_in_cols(
    request: PublicCallRequest,
    cols: &mut [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS],
    row_idx: u32,
) {
    cols[0][row_idx] = request.msg_sender.to_field();
    cols[1][row_idx] = request.contract_address.to_field();
    cols[2][row_idx] = request.is_static_call as Field;
    cols[3][row_idx] = request.calldata_hash;
}

fn set_public_call_request_array_in_cols<let SIZE: u32>(
    requests: [PublicCallRequest; SIZE],
    cols: &mut [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS],
    array_start_row_idx: u32,
) {
    for i in 0..requests.len() {
        let row = array_start_row_idx + i;
        set_public_call_request_in_cols(requests[i], cols, row);
    }
}

fn set_field_array_in_cols<let SIZE: u32>(
    arr: [Field; SIZE],
    cols: &mut [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS],
    array_start_row_idx: u32,
) {
    for i in 0..arr.len() {
        let row = array_start_row_idx + i;
        cols[0][row] = arr[i];
    }
}

fn set_l2_to_l1_msg_array_in_cols<let SIZE: u32>(
    arr: [Scoped<L2ToL1Message>; SIZE],
    cols: &mut [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS],
    array_start_row_idx: u32,
) {
    for i in 0..arr.len() {
        let row = array_start_row_idx + i;
        cols[0][row] = arr[i].inner.recipient.to_field();
        cols[1][row] = arr[i].inner.content;
        cols[2][row] = arr[i].contract_address.to_field();
    }
}

fn set_public_logs_in_cols<let SIZE: u32>(
    logs: [PublicLog; SIZE],
    cols: &mut [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS],
    array_start_row_idx: u32,
) {
    for i in 0..logs.len() {
        let first_row_for_log = array_start_row_idx + i * PUBLIC_LOG_SIZE_IN_FIELDS;
        for j in 0..PUBLIC_LOG_SIZE_IN_FIELDS {
            // always set contract address in col 0 so that some entry in the row is always non-zero
            cols[0][first_row_for_log + j] = logs[i].contract_address.to_field();
            cols[1][first_row_for_log + j] = logs[i].log.length as Field;
            // and set the actual log data entry
            cols[2][first_row_for_log + j] = logs[i].log.fields[j];
        }
    }
}

fn set_public_data_writes_in_cols<let SIZE: u32>(
    writes: [PublicDataWrite; SIZE],
    cols: &mut [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS],
    array_start_row_idx: u32,
) {
    for i in 0..writes.len() {
        let row = array_start_row_idx + i;
        cols[0][row] = writes[i].leaf_slot;
        cols[1][row] = writes[i].value;
    }
}

impl AvmCircuitPublicInputs {

    // WARNING: If updating this columns conversion, you must also update columns serialization
    // in the Cpp `PublicInputs` struct in avm_inputs.hpp
    pub fn to_columns(
        self,
    ) -> [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS] {
        let mut cols = [[0; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS];

        // Global variables
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX] =
            self.global_variables.chain_id;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX] = self.global_variables.version;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX] =
            self.global_variables.block_number as Field;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX] =
            self.global_variables.slot_number;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX] =
            self.global_variables.timestamp as Field;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX] =
            self.global_variables.coinbase.to_field();
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX] =
            self.global_variables.fee_recipient.to_field();
        // Gas fees
        set_gas_fees_in_cols(
            self.global_variables.gas_fees,
            &mut cols,
            AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX,
        );

        // Start tree snapshots
        set_snapshot_in_cols(
            self.start_tree_snapshots.l1_to_l2_message_tree,
            &mut cols,
            AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX,
        );
        set_snapshot_in_cols(
            self.start_tree_snapshots.note_hash_tree,
            &mut cols,
            AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX,
        );
        set_snapshot_in_cols(
            self.start_tree_snapshots.nullifier_tree,
            &mut cols,
            AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX,
        );
        set_snapshot_in_cols(
            self.start_tree_snapshots.public_data_tree,
            &mut cols,
            AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX,
        );

        // Start gas used
        set_gas_in_cols(
            self.start_gas_used,
            &mut cols,
            AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX,
        );

        // Gas settings
        set_gas_in_cols(
            self.gas_settings.gas_limits,
            &mut cols,
            AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX,
        );
        set_gas_in_cols(
            self.gas_settings.teardown_gas_limits,
            &mut cols,
            AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX,
        );
        set_gas_fees_in_cols(
            self.gas_settings.max_fees_per_gas,
            &mut cols,
            AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX,
        );
        set_gas_fees_in_cols(
            self.gas_settings.max_priority_fees_per_gas,
            &mut cols,
            AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX,
        );

        // Effective gas fees
        set_gas_fees_in_cols(
            self.global_variables.gas_fees,
            &mut cols,
            AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX,
        );

        // Fee payer
        cols[0][AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX] = self.fee_payer.to_field();

        // Setup, app logic, and teardown call request array lengths
        cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX] =
            self.public_call_request_array_lengths.setup_calls as Field;
        cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX] =
            self.public_call_request_array_lengths.app_logic_calls as Field;
        cols[0][AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX] =
            self.public_call_request_array_lengths.teardown_call as Field;

        // Setup, app logic, and teardown call requests
        set_public_call_request_array_in_cols(
            self.public_setup_call_requests,
            &mut cols,
            AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX,
        );
        set_public_call_request_array_in_cols(
            self.public_app_logic_call_requests,
            &mut cols,
            AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX,
        );
        set_public_call_request_in_cols(
            self.public_teardown_call_request,
            &mut cols,
            AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX,
        );

        // Previous non-revertible accumulated data array lengths
        cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] =
            self.previous_non_revertible_accumulated_data_array_lengths.note_hashes as Field;
        cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] =
            self.previous_non_revertible_accumulated_data_array_lengths.nullifiers as Field;
        cols[0][
    AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] =
            self.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs as Field;
        // Previous revertible accumulated data array lengths
        cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] =
            self.previous_revertible_accumulated_data_array_lengths.note_hashes as Field;
        cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] =
            self.previous_revertible_accumulated_data_array_lengths.nullifiers as Field;
        cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] =
            self.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs as Field;

        // Previous non-revertible accumulated data
        set_field_array_in_cols(
            self.previous_non_revertible_accumulated_data.note_hashes,
            &mut cols,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
        );
        set_field_array_in_cols(
            self.previous_non_revertible_accumulated_data.nullifiers,
            &mut cols,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
        );
        set_l2_to_l1_msg_array_in_cols(
            self.previous_non_revertible_accumulated_data.l2_to_l1_msgs,
            &mut cols,
            AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
        );

        // Previous revertible accumulated data
        set_field_array_in_cols(
            self.previous_revertible_accumulated_data.note_hashes,
            &mut cols,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
        );
        set_field_array_in_cols(
            self.previous_revertible_accumulated_data.nullifiers,
            &mut cols,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
        );
        set_l2_to_l1_msg_array_in_cols(
            self.previous_revertible_accumulated_data.l2_to_l1_msgs,
            &mut cols,
            AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
        );

        // End tree snapshots
        set_snapshot_in_cols(
            self.end_tree_snapshots.l1_to_l2_message_tree,
            &mut cols,
            AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX,
        );
        set_snapshot_in_cols(
            self.end_tree_snapshots.note_hash_tree,
            &mut cols,
            AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX,
        );
        set_snapshot_in_cols(
            self.end_tree_snapshots.nullifier_tree,
            &mut cols,
            AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX,
        );
        set_snapshot_in_cols(
            self.end_tree_snapshots.public_data_tree,
            &mut cols,
            AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX,
        );

        // End gas used
        set_gas_in_cols(
            self.end_gas_used,
            &mut cols,
            AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX,
        );

        // Accumulated Data Array Lengths
        cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX] =
            self.accumulated_data_array_lengths.note_hashes as Field;
        cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX] =
            self.accumulated_data_array_lengths.nullifiers as Field;
        cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX] =
            self.accumulated_data_array_lengths.l2_to_l1_msgs as Field;
        cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_LOGS_ROW_IDX] =
            self.accumulated_data_array_lengths.public_logs as Field;
        cols[0][AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_ARRAY_LENGTHS_PUBLIC_DATA_WRITES_ROW_IDX] =
            self.accumulated_data_array_lengths.public_data_writes as Field;

        // AVM accumulated data
        set_field_array_in_cols(
            self.accumulated_data.note_hashes,
            &mut cols,
            AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
        );
        set_field_array_in_cols(
            self.accumulated_data.nullifiers,
            &mut cols,
            AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
        );
        set_l2_to_l1_msg_array_in_cols(
            self.accumulated_data.l2_to_l1_msgs,
            &mut cols,
            AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
        );
        set_public_logs_in_cols(
            self.accumulated_data.public_logs,
            &mut cols,
            AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX,
        );
        set_public_data_writes_in_cols(
            self.accumulated_data.public_data_writes,
            &mut cols,
            AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX,
        );

        // transaction fee
        cols[0][AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX] = self.transaction_fee;

        // reverted
        cols[0][AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX] = self.reverted as Field;

        // return
        cols
    }

    pub fn to_columns_flat(self) -> [Field; AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH] {
        let mut flat = [0; AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH];

        let cols = self.to_columns();
        for col in 0..AVM_NUM_PUBLIC_INPUT_COLUMNS {
            for row in 0..AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH {
                flat[col * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH + row] = cols[col][row];
            }
        }

        flat
    }
}

pub struct AvmProofData {
    pub public_inputs: AvmCircuitPublicInputs,
    pub proof: AvmProof,
    pub vk_data: VkData<AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED>,
}

impl Verifiable for AvmProofData {
    /// Verifies the proof against the verification key and public inputs.
    /// The vk hash is also checked in the backend to match the key.
    fn verify(self) {
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            self.proof.fields,
            self.public_inputs.to_columns_flat(),
            self.vk_data.vk.hash,
            PROOF_TYPE_AVM,
        );
    }
}

impl AvmProofData {
    /// Validates that the vk hash exists in the vk tree at the expected index.
    pub fn validate_vk_in_vk_tree(self, vk_tree_root: Field) {
        assert_eq(self.vk_data.leaf_index, AVM_VK_INDEX);
        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        self.vk_data.validate_in_vk_tree(vk_tree_root);
    }
}

#[test]
fn serialization_of_empty_avm_circuit_public_inputs() {
    let item = AvmCircuitPublicInputs::empty();
    let serialized = item.serialize();
    let deserialized = AvmCircuitPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn flat_columns_of_empty_avm_circuit_public_inputs() {
    let item = AvmCircuitPublicInputs::empty();
    let flat = item.to_columns_flat();
    // some assertion just to make sure it isn't optimized away
    assert(flat.len() == AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH);
}

#[test]
fn flat_columns_of_avm_circuit_public_inputs() {
    // Create a test instance with specific values
    let mut item = AvmCircuitPublicInputs::empty();

    // Set some values in different parts of the struct to test serialization
    // Global variables - beginning of the struct
    item.global_variables.chain_id = 123;
    item.global_variables.block_number = 456;
    item.global_variables.timestamp = 789;

    // Fee payer - middle of the struct
    item.fee_payer = AztecAddress::from_field(12345);

    // revertible l2_to_l1_msgs from private
    item.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].inner.recipient =
        EthAddress::from_field(1234);
    item.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].inner.content = 5678;
    item.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].contract_address =
        AztecAddress::from_field(3456);

    // Test some array elements
    // Add a note hash to accumulated data
    item.accumulated_data.note_hashes[2] = 54321;

    // Add a public log
    item.accumulated_data.public_logs[0].contract_address = AztecAddress::from_field(11223);
    // set some number of items in the log (less than max)
    item.accumulated_data.public_logs[0].log.length = PUBLIC_LOG_SIZE_IN_FIELDS - 2;
    for j in 0..PUBLIC_LOG_SIZE_IN_FIELDS - 2 {
        item.accumulated_data.public_logs[0].log.fields[j] = 10000 + j as Field;
    }

    // Add a public data write
    item.accumulated_data.public_data_writes[1].leaf_slot = 5555;
    item.accumulated_data.public_data_writes[1].value = 6666;

    // End gas used - toward the end of the struct
    item.end_gas_used.da_gas = 5000;
    item.end_gas_used.l2_gas = 7000;

    // Transaction fee - at the end of the struct
    item.transaction_fee = 9876;
    item.reverted = true;

    // Serialize to columns
    let flat = item.to_columns_flat();

    // Verify length
    // Define column offsets
    let col0_offset = 0;
    let col1_offset = col0_offset + AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH;
    let col2_offset = col1_offset + AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH;

    // Verify serialized values are at the expected positions

    // Global variables
    assert_eq(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX], 123);
    assert_eq(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX], 456);
    assert_eq(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX], 789);

    // Fee payer
    assert_eq(flat[col0_offset + AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX], 12345);

    // test l2_to_l1_msgs which use up 4 columns
    let l2_to_l1_msg_row =
        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX;
    assert_eq(flat[col0_offset + l2_to_l1_msg_row], 1234);
    assert_eq(flat[col1_offset + l2_to_l1_msg_row], 5678);
    assert_eq(flat[col2_offset + l2_to_l1_msg_row], 3456);

    // Array elements
    // Note hash array
    assert_eq(
        flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + 2],
        54321,
    );

    // Public logs
    let public_log_row = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX;
    assert_eq(flat[col1_offset + public_log_row], (PUBLIC_LOG_SIZE_IN_FIELDS - 2) as Field);
    for j in 0..PUBLIC_LOG_SIZE_IN_FIELDS - 2 {
        assert_eq(flat[col2_offset + public_log_row + j], 10000 + j as Field);
    }

    // Public data writes
    let public_data_write_row =
        AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX + 1;
    assert_eq(flat[col0_offset + public_data_write_row], 5555);
    assert_eq(flat[col1_offset + public_data_write_row], 6666);

    // Pick a an unset/empty element and confirm that it is zero
    assert_eq(flat[col0_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX], 0);
    assert_eq(flat[col1_offset + AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX], 0);

    // End gas used
    assert_eq(flat[col0_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], 5000);
    assert_eq(flat[col1_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], 7000);

    // Transaction fee and reverted status
    assert_eq(flat[col0_offset + AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX], 9876);
    assert_eq(flat[col0_offset + AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX], 1);
}
