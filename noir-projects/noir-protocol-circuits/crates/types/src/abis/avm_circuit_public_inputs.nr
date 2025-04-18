use crate::{
    abis::{
        accumulated_data::{
            avm_accumulated_data::AvmAccumulatedData,
            private_to_avm_accumulated_data::{
                PrivateToAvmAccumulatedData, PrivateToAvmAccumulatedDataArrayLengths,
            },
        },
        gas::Gas,
        gas_settings::GasSettings,
        global_variables::GlobalVariables,
        public_call_request::PublicCallRequest,
        tree_snapshots::TreeSnapshots,
    },
    address::AztecAddress,
    constants::{
        AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH, AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
        MAX_ENQUEUED_CALLS_PER_TX, AVM_NUM_PUBLIC_INPUT_COLUMNS, AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH,
        AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX,
        AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX, AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX, AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX, AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX, AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX, AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX,
        AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX, AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX, AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX, AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX, AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX, AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
        AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX, AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX,
        AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX,
        AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX, AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX, AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX, AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX, AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX,
        AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX, AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX,
        PUBLIC_LOG_DATA_SIZE_IN_FIELDS, PUBLIC_DATA_WRITE_LENGTH,
    },
    proof::{avm_proof::AvmProof, traits::Verifiable, vk_data::VkData},
    traits::{Deserialize, Empty, FromField, Serialize, ToField},
    utils::reader::Reader,
};

use std::hash::{poseidon2, poseidon2_permutation};

pub struct AvmCircuitPublicInputs {
    ///////////////////////////////////
    // Inputs.
    pub global_variables: GlobalVariables,
    pub start_tree_snapshots: TreeSnapshots,
    pub start_gas_used: Gas,
    pub gas_settings: GasSettings,
    pub fee_payer: AztecAddress,
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
            fee_payer: AztecAddress::zero(),
            public_setup_call_requests: [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            public_app_logic_call_requests: [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            public_teardown_call_request: PublicCallRequest::empty(),
            previous_non_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths::empty(),
            previous_revertible_accumulated_data_array_lengths: PrivateToAvmAccumulatedDataArrayLengths::empty(),
            previous_non_revertible_accumulated_data: PrivateToAvmAccumulatedData::empty(),
            previous_revertible_accumulated_data: PrivateToAvmAccumulatedData::empty(),
            end_tree_snapshots: TreeSnapshots::empty(),
            end_gas_used: Gas::empty(),
            accumulated_data: AvmAccumulatedData::empty(),
            transaction_fee: 0,
            reverted: false,
        }
    }
}

impl Eq for AvmCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.global_variables == other.global_variables)
            & (self.start_tree_snapshots == other.start_tree_snapshots)
            & (self.start_gas_used == other.start_gas_used)
            & (self.gas_settings == other.gas_settings)
            & (self.fee_payer == other.fee_payer)
            & (self.public_setup_call_requests == other.public_setup_call_requests)
            & (self.public_app_logic_call_requests == other.public_app_logic_call_requests)
            & (self.public_teardown_call_request == other.public_teardown_call_request)
            & (
                self.previous_non_revertible_accumulated_data_array_lengths
                    == other.previous_non_revertible_accumulated_data_array_lengths
            )
            & (
                self.previous_revertible_accumulated_data_array_lengths
                    == other.previous_revertible_accumulated_data_array_lengths
            )
            & (
                self.previous_non_revertible_accumulated_data
                    == other.previous_non_revertible_accumulated_data
            )
            & (
                self.previous_revertible_accumulated_data
                    == other.previous_revertible_accumulated_data
            )
            & (self.end_tree_snapshots == other.end_tree_snapshots)
            & (self.end_gas_used == other.end_gas_used)
            & (self.accumulated_data == other.accumulated_data)
            & (self.transaction_fee == other.transaction_fee)
            & (self.reverted == other.reverted)
    }
}

impl Serialize<AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH> for AvmCircuitPublicInputs {
    fn serialize(self) -> [Field; AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH] {
        let mut fields: BoundedVec<Field, AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.global_variables.serialize());
        fields.extend_from_array(self.start_tree_snapshots.serialize());
        fields.extend_from_array(self.start_gas_used.serialize());
        fields.extend_from_array(self.gas_settings.serialize());
        fields.push(self.fee_payer.to_field());
        for i in 0..self.public_setup_call_requests.len() {
            fields.extend_from_array(self.public_setup_call_requests[i].serialize());
        }
        for i in 0..self.public_app_logic_call_requests.len() {
            fields.extend_from_array(self.public_app_logic_call_requests[i].serialize());
        }
        fields.extend_from_array(self.public_teardown_call_request.serialize());
        fields.extend_from_array(self
            .previous_non_revertible_accumulated_data_array_lengths
            .serialize());
        fields.extend_from_array(self.previous_revertible_accumulated_data_array_lengths.serialize());
        fields.extend_from_array(self.previous_non_revertible_accumulated_data.serialize());
        fields.extend_from_array(self.previous_revertible_accumulated_data.serialize());
        fields.extend_from_array(self.end_tree_snapshots.serialize());
        fields.extend_from_array(self.end_gas_used.serialize());
        fields.extend_from_array(self.accumulated_data.serialize());
        fields.push(self.transaction_fee);
        fields.push(self.reverted as Field);

        assert_eq(fields.len(), AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH);

        fields.storage()
    }
}

impl Deserialize<AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH> for AvmCircuitPublicInputs {
    fn deserialize(fields: [Field; AVM_CIRCUIT_PUBLIC_INPUTS_LENGTH]) -> AvmCircuitPublicInputs {
        let mut reader = Reader::new(fields);
        let item = AvmCircuitPublicInputs {
            global_variables: reader.read_struct(GlobalVariables::deserialize),
            start_tree_snapshots: reader.read_struct(TreeSnapshots::deserialize),
            start_gas_used: reader.read_struct(Gas::deserialize),
            gas_settings: reader.read_struct(GasSettings::deserialize),
            fee_payer: AztecAddress::from_field(reader.read()),
            public_setup_call_requests: reader.read_struct_array(
                PublicCallRequest::deserialize,
                [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            ),
            public_app_logic_call_requests: reader.read_struct_array(
                PublicCallRequest::deserialize,
                [PublicCallRequest::empty(); MAX_ENQUEUED_CALLS_PER_TX],
            ),
            public_teardown_call_request: reader.read_struct(PublicCallRequest::deserialize),
            previous_non_revertible_accumulated_data_array_lengths: reader.read_struct(
                PrivateToAvmAccumulatedDataArrayLengths::deserialize,
            ),
            previous_revertible_accumulated_data_array_lengths: reader.read_struct(
                PrivateToAvmAccumulatedDataArrayLengths::deserialize,
            ),
            previous_non_revertible_accumulated_data: reader.read_struct(
                PrivateToAvmAccumulatedData::deserialize,
            ),
            previous_revertible_accumulated_data: reader.read_struct(
                PrivateToAvmAccumulatedData::deserialize,
            ),
            end_tree_snapshots: reader.read_struct(TreeSnapshots::deserialize),
            end_gas_used: reader.read_struct(Gas::deserialize),
            accumulated_data: reader.read_struct(AvmAccumulatedData::deserialize),
            transaction_fee: reader.read(),
            reverted: reader.read() as bool,
        };
        reader.finish();
        item
    }
}

impl AvmCircuitPublicInputs {
    pub fn to_columns(self) -> [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS] {
        // TODO(dbanks12): assertions!
        let mut cols: [[Field; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS] = [[0; AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH]; AVM_NUM_PUBLIC_INPUT_COLUMNS];
        // Global variables
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX] = self.global_variables.chain_id;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX] = self.global_variables.version;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX] = self.global_variables.block_number;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX] = self.global_variables.slot_number;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX] = self.global_variables.timestamp as Field;
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX] = self.global_variables.coinbase.to_field();
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX] = self.global_variables.fee_recipient.to_field();
        // Gas fees
        cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX] = self.global_variables.gas_fees.fee_per_da_gas;
        cols[1][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX] = self.global_variables.gas_fees.fee_per_l2_gas;

        // Start tree snapshots
        cols[0][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] = self.start_tree_snapshots.l1_to_l2_message_tree.root;
        cols[1][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] = self.start_tree_snapshots.l1_to_l2_message_tree.next_available_leaf_index as Field;
        cols[0][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] = self.start_tree_snapshots.note_hash_tree.root;
        cols[1][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] = self.start_tree_snapshots.note_hash_tree.next_available_leaf_index as Field;
        cols[0][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] = self.start_tree_snapshots.nullifier_tree.root;
        cols[1][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] = self.start_tree_snapshots.nullifier_tree.next_available_leaf_index as Field;
        cols[0][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] = self.start_tree_snapshots.public_data_tree.root;
        cols[1][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] = self.start_tree_snapshots.public_data_tree.next_available_leaf_index as Field;

        // Start gas used
        cols[0][AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX] = self.start_gas_used.da_gas as Field;
        cols[1][AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX] = self.start_gas_used.l2_gas as Field;
        
        // Gas settings
        cols[0][AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX] = self.gas_settings.gas_limits.da_gas as Field;
        cols[1][AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX] = self.gas_settings.gas_limits.l2_gas as Field;
        cols[0][AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX] = self.gas_settings.teardown_gas_limits.da_gas as Field;
        cols[1][AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX] = self.gas_settings.teardown_gas_limits.l2_gas as Field;
        cols[0][AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX] = self.gas_settings.max_fees_per_gas.fee_per_da_gas;
        cols[1][AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX] = self.gas_settings.max_fees_per_gas.fee_per_l2_gas;
        cols[0][AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX] = self.gas_settings.max_priority_fees_per_gas.fee_per_da_gas;
        cols[1][AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX] = self.gas_settings.max_priority_fees_per_gas.fee_per_l2_gas;

        // Fee payer
        cols[0][AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX] = self.fee_payer.to_field();

        // Public setup call requests
        for i in 0..self.public_setup_call_requests.len() {
            let row_idx = AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX + i;
            cols[0][row_idx] = self.public_setup_call_requests[i].msg_sender.to_field();
            cols[1][row_idx] = self.public_setup_call_requests[i].contract_address.to_field();
            cols[2][row_idx] = self.public_setup_call_requests[i].is_static_call as Field;
            cols[3][row_idx] = self.public_setup_call_requests[i].calldata_hash;
        }

        // Public app logic call requests
        for i in 0..self.public_app_logic_call_requests.len() {
            let row_idx = AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX + i;
            cols[0][row_idx] = self.public_app_logic_call_requests[i].msg_sender.to_field();
            cols[1][row_idx] = self.public_app_logic_call_requests[i].contract_address.to_field();
            cols[2][row_idx] = self.public_app_logic_call_requests[i].is_static_call as Field;
            cols[3][row_idx] = self.public_app_logic_call_requests[i].calldata_hash;
        }

        // Public teardown call request
        let row_idx = AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX;
        cols[0][row_idx] = self.public_teardown_call_request.msg_sender.to_field();
        cols[1][row_idx] = self.public_teardown_call_request.contract_address.to_field();
        cols[2][row_idx] = self.public_teardown_call_request.is_static_call as Field;
        cols[3][row_idx] = self.public_teardown_call_request.calldata_hash;

        // Previous non-revertible accumulated data lengths
        cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_non_revertible_accumulated_data_array_lengths.note_hashes as Field;
        cols[1][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_non_revertible_accumulated_data_array_lengths.nullifiers as Field;
        cols[2][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs as Field;

        // Previous revertible accumulated data array lengths
        cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_revertible_accumulated_data_array_lengths.note_hashes as Field;
        cols[1][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_revertible_accumulated_data_array_lengths.nullifiers as Field;
        cols[2][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs as Field;
        
        // Previous non-revertible accumulated data
        // note hashes
        for i in 0..self.previous_non_revertible_accumulated_data.note_hashes.len() {
            cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.note_hashes[i];
        }
        // nullifiers
        for i in 0..self.previous_non_revertible_accumulated_data.nullifiers.len() {
            cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.nullifiers[i];
        }
        // l2_to_l1_msgs
        for i in 0..self.previous_non_revertible_accumulated_data.l2_to_l1_msgs.len() {
            cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.l2_to_l1_msgs[i].message.recipient.to_field();
            cols[1][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.l2_to_l1_msgs[i].message.content;
            cols[2][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.l2_to_l1_msgs[i].message.counter as Field;
            cols[3][AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.l2_to_l1_msgs[i].contract_address.to_field();
        }
        
        // Previous revertible accumulated data
        // note hashes
        for i in 0..self.previous_revertible_accumulated_data.note_hashes.len() {
            cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + i] = self.previous_revertible_accumulated_data.note_hashes[i];
        }
        // nullifiers
        for i in 0..self.previous_revertible_accumulated_data.nullifiers.len() {
            cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + i] = self.previous_revertible_accumulated_data.nullifiers[i];
        }
        // l2_to_l1_msgs
        for i in 0..self.previous_revertible_accumulated_data.l2_to_l1_msgs.len() {
            cols[0][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_revertible_accumulated_data.l2_to_l1_msgs[i].message.recipient.to_field();
            cols[1][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_revertible_accumulated_data.l2_to_l1_msgs[i].message.content;
            cols[2][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_revertible_accumulated_data.l2_to_l1_msgs[i].message.counter as Field;
            cols[3][AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_revertible_accumulated_data.l2_to_l1_msgs[i].contract_address.to_field();
        }

        // End tree snapshots
        cols[0][AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] = self.end_tree_snapshots.l1_to_l2_message_tree.root;
        cols[1][AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] = self.end_tree_snapshots.l1_to_l2_message_tree.next_available_leaf_index as Field;
        cols[0][AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] = self.end_tree_snapshots.note_hash_tree.root;
        cols[1][AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] = self.end_tree_snapshots.note_hash_tree.next_available_leaf_index as Field;
        cols[0][AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] = self.end_tree_snapshots.nullifier_tree.root;
        cols[1][AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] = self.end_tree_snapshots.nullifier_tree.next_available_leaf_index as Field;
        cols[0][AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] = self.end_tree_snapshots.public_data_tree.root;
        cols[1][AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] = self.end_tree_snapshots.public_data_tree.next_available_leaf_index as Field;

        // End gas used
        cols[0][AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX] = self.end_gas_used.da_gas as Field;
        cols[1][AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX] = self.end_gas_used.l2_gas as Field;

        // End accumulated data
        // note hashes
        for i in 0..self.accumulated_data.note_hashes.len() {   
            cols[0][AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + i] = self.accumulated_data.note_hashes[i];
        }
        // nullifiers
        for i in 0..self.accumulated_data.nullifiers.len() {
            cols[0][AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + i] = self.accumulated_data.nullifiers[i];
        }
        // l2_to_l1_msgs
        for i in 0..self.accumulated_data.l2_to_l1_msgs.len() {
            cols[0][AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.accumulated_data.l2_to_l1_msgs[i].message.recipient.to_field();
            cols[1][AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.accumulated_data.l2_to_l1_msgs[i].message.content;
            cols[2][AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.accumulated_data.l2_to_l1_msgs[i].message.counter as Field;
            cols[3][AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.accumulated_data.l2_to_l1_msgs[i].contract_address.to_field();
        }
        // public logs
        for i in 0..self.accumulated_data.public_logs.len() {
            let first_row_for_log = AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX + (i * PUBLIC_LOG_DATA_SIZE_IN_FIELDS);
            cols[0][first_row_for_log] = self.accumulated_data.public_logs[i].contract_address.to_field();
            for j in 0..PUBLIC_LOG_DATA_SIZE_IN_FIELDS {
                cols[1][first_row_for_log + j] = self.accumulated_data.public_logs[i].log.fields[j];
            }
        }
        // public data writes
        for i in 0..self.accumulated_data.public_data_writes.len() {
            let first_row_for_data_write = AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX + (i * PUBLIC_DATA_WRITE_LENGTH);
            cols[0][first_row_for_data_write] = self.accumulated_data.public_data_writes[i].leaf_slot;
            cols[1][first_row_for_data_write] = self.accumulated_data.public_data_writes[i].value;
        }

        // transaction fee
        cols[0][AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX] = self.transaction_fee;

        // reverted
        cols[0][AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX] = self.reverted as Field;
        
        // return
        cols
    }

    pub fn to_catted_columns(self) -> [Field; AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH] {
        // TODO(dbanks12): assertions!
        let mut cols: [Field; AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH] = [0; AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH];

        let col0_offset = 0;
        let col1_offset = col0_offset + AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH;
        let col2_offset = col1_offset + AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH;
        let col3_offset = col2_offset + AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH;

        // Global variables
        cols[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX] = self.global_variables.block_number;
        cols[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_SLOT_NUMBER_ROW_IDX] = self.global_variables.slot_number;
        cols[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX] = self.global_variables.timestamp as Field;
        cols[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_COINBASE_ROW_IDX] = self.global_variables.coinbase.to_field();
        cols[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_FEE_RECIPIENT_ROW_IDX] = self.global_variables.fee_recipient.to_field();
        // Gas fees
        cols[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX] = self.global_variables.gas_fees.fee_per_da_gas;
        cols[col1_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX] = self.global_variables.gas_fees.fee_per_l2_gas;

        // Start tree snapshots
        cols[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] = self.start_tree_snapshots.l1_to_l2_message_tree.root;
        cols[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] = self.start_tree_snapshots.l1_to_l2_message_tree.next_available_leaf_index as Field;
        cols[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] = self.start_tree_snapshots.note_hash_tree.root;
        cols[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] = self.start_tree_snapshots.note_hash_tree.next_available_leaf_index as Field;
        cols[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] = self.start_tree_snapshots.nullifier_tree.root;
        cols[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] = self.start_tree_snapshots.nullifier_tree.next_available_leaf_index as Field;
        cols[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] = self.start_tree_snapshots.public_data_tree.root;
        cols[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] = self.start_tree_snapshots.public_data_tree.next_available_leaf_index as Field;

        // Start gas used
        cols[col0_offset + AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX] = self.start_gas_used.da_gas as Field;
        cols[col1_offset + AVM_PUBLIC_INPUTS_START_GAS_USED_ROW_IDX] = self.start_gas_used.l2_gas as Field;
        
        // Gas settings
        cols[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX] = self.gas_settings.gas_limits.da_gas as Field;
        cols[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_GAS_LIMITS_ROW_IDX] = self.gas_settings.gas_limits.l2_gas as Field;
        cols[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX] = self.gas_settings.teardown_gas_limits.da_gas as Field;
        cols[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_TEARDOWN_GAS_LIMITS_ROW_IDX] = self.gas_settings.teardown_gas_limits.l2_gas as Field;
        cols[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX] = self.gas_settings.max_fees_per_gas.fee_per_da_gas;
        cols[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_FEES_PER_GAS_ROW_IDX] = self.gas_settings.max_fees_per_gas.fee_per_l2_gas;
        cols[col0_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX] = self.gas_settings.max_priority_fees_per_gas.fee_per_da_gas;
        cols[col1_offset + AVM_PUBLIC_INPUTS_GAS_SETTINGS_MAX_PRIORITY_FEES_PER_GAS_ROW_IDX] = self.gas_settings.max_priority_fees_per_gas.fee_per_l2_gas;

        // Fee payer
        cols[col0_offset + AVM_PUBLIC_INPUTS_FEE_PAYER_ROW_IDX] = self.fee_payer.to_field();

        // Public setup call requests
        for i in 0..self.public_setup_call_requests.len() {
            let row_idx = AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX + i;
            cols[col0_offset + row_idx] = self.public_setup_call_requests[i].msg_sender.to_field();
            cols[col1_offset + row_idx] = self.public_setup_call_requests[i].contract_address.to_field();
            cols[col2_offset + row_idx] = self.public_setup_call_requests[i].is_static_call as Field;
            cols[col3_offset + row_idx] = self.public_setup_call_requests[i].calldata_hash;
        }

        // Public app logic call requests
        for i in 0..self.public_app_logic_call_requests.len() {
            let row_idx = AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX + i;
            cols[col0_offset + row_idx] = self.public_app_logic_call_requests[i].msg_sender.to_field();
            cols[col1_offset + row_idx] = self.public_app_logic_call_requests[i].contract_address.to_field();
            cols[col2_offset + row_idx] = self.public_app_logic_call_requests[i].is_static_call as Field;
            cols[col3_offset + row_idx] = self.public_app_logic_call_requests[i].calldata_hash;
        }

        // Public teardown call request
        let row_idx = AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX;
        cols[col0_offset + row_idx] = self.public_teardown_call_request.msg_sender.to_field();
        cols[col1_offset + row_idx] = self.public_teardown_call_request.contract_address.to_field();
        cols[col2_offset + row_idx] = self.public_teardown_call_request.is_static_call as Field;
        cols[col3_offset + row_idx] = self.public_teardown_call_request.calldata_hash;

        // Previous non-revertible accumulated data lengths
        cols[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_non_revertible_accumulated_data_array_lengths.note_hashes as Field;
        cols[col1_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_non_revertible_accumulated_data_array_lengths.nullifiers as Field;
        cols[col2_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs as Field;

        // Previous revertible accumulated data array lengths
        cols[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_revertible_accumulated_data_array_lengths.note_hashes as Field;
        cols[col1_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_revertible_accumulated_data_array_lengths.nullifiers as Field;
        cols[col2_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX] = self.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs as Field;
        
        // Previous non-revertible accumulated data
        // note hashes
        for i in 0..self.previous_non_revertible_accumulated_data.note_hashes.len() {
            cols[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.note_hashes[i];
        }
        // nullifiers
        for i in 0..self.previous_non_revertible_accumulated_data.nullifiers.len() {
            cols[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.nullifiers[i];
        }
        // l2_to_l1_msgs
        for i in 0..self.previous_non_revertible_accumulated_data.l2_to_l1_msgs.len() {
            cols[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.l2_to_l1_msgs[i].message.recipient.to_field();
            cols[col1_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.l2_to_l1_msgs[i].message.content;
            cols[col2_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.l2_to_l1_msgs[i].message.counter as Field;
            cols[col3_offset + AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_non_revertible_accumulated_data.l2_to_l1_msgs[i].contract_address.to_field();
        }
        
        // Previous revertible accumulated data
        // note hashes
        for i in 0..self.previous_revertible_accumulated_data.note_hashes.len() {
            cols[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + i] = self.previous_revertible_accumulated_data.note_hashes[i];
        }
        // nullifiers
        for i in 0..self.previous_revertible_accumulated_data.nullifiers.len() {
            cols[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + i] = self.previous_revertible_accumulated_data.nullifiers[i];
        }
        // l2_to_l1_msgs
        for i in 0..self.previous_revertible_accumulated_data.l2_to_l1_msgs.len() {
            cols[col0_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_revertible_accumulated_data.l2_to_l1_msgs[i].message.recipient.to_field();
            cols[col1_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_revertible_accumulated_data.l2_to_l1_msgs[i].message.content;
            cols[col2_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_revertible_accumulated_data.l2_to_l1_msgs[i].message.counter as Field;
            cols[col3_offset + AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.previous_revertible_accumulated_data.l2_to_l1_msgs[i].contract_address.to_field();
        }

        // End tree snapshots
        cols[col0_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] = self.end_tree_snapshots.l1_to_l2_message_tree.root;
        cols[col1_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] = self.end_tree_snapshots.l1_to_l2_message_tree.next_available_leaf_index as Field;
        cols[col0_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] = self.end_tree_snapshots.note_hash_tree.root;
        cols[col1_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] = self.end_tree_snapshots.note_hash_tree.next_available_leaf_index as Field;
        cols[col0_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] = self.end_tree_snapshots.nullifier_tree.root;
        cols[col1_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] = self.end_tree_snapshots.nullifier_tree.next_available_leaf_index as Field;
        cols[col0_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] = self.end_tree_snapshots.public_data_tree.root;
        cols[col1_offset + AVM_PUBLIC_INPUTS_END_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] = self.end_tree_snapshots.public_data_tree.next_available_leaf_index as Field;

        // End gas used
        cols[col0_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX] = self.end_gas_used.da_gas as Field;
        cols[col1_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX] = self.end_gas_used.l2_gas as Field;

        // End accumulated data
        // note hashes
        for i in 0..self.accumulated_data.note_hashes.len() {   
            cols[col0_offset + AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX + i] = self.accumulated_data.note_hashes[i];
        }
        // nullifiers
        for i in 0..self.accumulated_data.nullifiers.len() {
            cols[col0_offset + AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX + i] = self.accumulated_data.nullifiers[i];
        }
        // l2_to_l1_msgs
        for i in 0..self.accumulated_data.l2_to_l1_msgs.len() {
            cols[col0_offset + AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.accumulated_data.l2_to_l1_msgs[i].message.recipient.to_field();
            cols[col1_offset + AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.accumulated_data.l2_to_l1_msgs[i].message.content;
            cols[col2_offset + AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.accumulated_data.l2_to_l1_msgs[i].message.counter as Field;
            cols[col3_offset + AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX + i] = self.accumulated_data.l2_to_l1_msgs[i].contract_address.to_field();
        }
        // public logs
        for i in 0..self.accumulated_data.public_logs.len() {
            let first_row_for_log = AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX + (i * PUBLIC_LOG_DATA_SIZE_IN_FIELDS);
            cols[col0_offset + first_row_for_log] = self.accumulated_data.public_logs[i].contract_address.to_field();
            for j in 0..PUBLIC_LOG_DATA_SIZE_IN_FIELDS {
                cols[col1_offset + first_row_for_log + j] = self.accumulated_data.public_logs[i].log.fields[j];
            }
        }
        // public data writes
        for i in 0..self.accumulated_data.public_data_writes.len() {
            let first_row_for_data_write = AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX + i;
            cols[col0_offset + first_row_for_data_write] = self.accumulated_data.public_data_writes[i].leaf_slot;
            cols[col1_offset + first_row_for_data_write] = self.accumulated_data.public_data_writes[i].value;
        }

        // transaction fee
        cols[col0_offset + AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX] = self.transaction_fee;

        // reverted
        cols[col0_offset + AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX] = self.reverted as Field;
        
        cols
    }
}

pub struct AvmProofData {
    pub public_inputs: AvmCircuitPublicInputs,
    pub proof: AvmProof,
    pub vk_data: VkData<AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl Verifiable for AvmProofData {
    fn verify(self) {
        // TODO(#8470)
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
fn catted_columns_of_empty_avm_circuit_public_inputs() {
    let item = AvmCircuitPublicInputs::empty();
    let catted_columns = item.to_catted_columns();
    assert(catted_columns.len() == AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH);
}

#[test]
fn catted_columns_of_avm_circuit_public_inputs() {
    // real inputs (not empty)
    let item = AvmCircuitPublicInputs::empty();
    // fill with real data
    item.global_variables.block_number = 1;
    item.global_variables.slot_number = 2;
    item.global_variables.timestamp = 3;
    item.global_variables.coinbase = 4.into();
    item.global_variables.fee_recipient = 5.into();
    item.global_variables.gas_fees = { fee_per_da_gas: 6, fee_per_l2_gas: 7 };
    item.start_tree_snapshots.l1_to_l2_message_tree.root = 8;
    item.start_tree_snapshots.l1_to_l2_message_tree.next_available_leaf_index = 9;
    item.start_tree_snapshots.note_hash_tree.root = 10;
    item.start_tree_snapshots.note_hash_tree.next_available_leaf_index = 11;
    item.start_tree_snapshots.nullifier_tree.root = 12;
    item.start_tree_snapshots.nullifier_tree.next_available_leaf_index = 13;
    item.start_tree_snapshots.public_data_tree.root = 14;
    item.start_tree_snapshots.public_data_tree.next_available_leaf_index = 15;
    item.start_gas_used.da_gas = 16;
    item.start_gas_used.l2_gas = 17;
    item.gas_settings.gas_limits.da_gas = 18;
    item.gas_settings.gas_limits.l2_gas = 19;
    item.gas_settings.teardown_gas_limits.da_gas = 20;
    item.gas_settings.teardown_gas_limits.l2_gas = 21;
    item.gas_settings.max_fees_per_gas = MaxFeesPerGas::from_fields(22, 23);
    item.gas_settings.max_priority_fees_per_gas = MaxPriorityFeesPerGas::from_fields(24, 25);
    item.fee_payer = AztecAddress::from_field(26);
    item.public_setup_call_requests = vec![];
    item.public_app_logic_call_requests = vec![];
    item.public_teardown_call_request = PublicTeardownCallRequest::empty();
    item.previous_non_revertible_accumulated_data_array_lengths.note_hashes = 27;
    item.previous_non_revertible_accumulated_data_array_lengths.nullifiers = 28;
    item.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs = 29;
    item.previous_revertible_accumulated_data_array_lengths.note_hashes = 30;
    item.previous_revertible_accumulated_data_array_lengths.nullifiers = 31;
    item.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs = 32;
    item.previous_non_revertible_accumulated_data.note_hashes = vec![];
    item.previous_non_revertible_accumulated_data.nullifiers = vec![];
    item.previous_non_revertible_accumulated_data.l2_to_l1_msgs = vec![];
    item.previous_revertible_accumulated_data.note_hashes = vec![];
    item.previous_revertible_accumulated_data.nullifiers = vec![];
    item.previous_revertible_accumulated_data.l2_to_l1_msgs = vec![];
    
    
    
    
}

