struct GeneratorIndex;

impl GeneratorIndex {
    // Indices with size ≤ 8
    pub fn commitment() -> Field { 1 }
    pub fn commitment_nonce() -> Field { 2 }
    pub fn unique_commitment() -> Field { 3 }
    pub fn siloed_commitment() -> Field { 4 }
    pub fn nullifier() -> Field { 5 }
    pub fn initialisation_nullifier() -> Field { 6 }
    pub fn outer_nullifier() -> Field { 7 }
    pub fn public_data_read() -> Field { 8 }
    pub fn public_data_update_request() -> Field { 9 }
    pub fn function_data() -> Field { 10 }
    pub fn function_leaf() -> Field { 11 }
    pub fn contract_deployment_data() -> Field { 12 }
    pub fn constructor() -> Field { 13 }
    pub fn constructor_args() -> Field { 14 }
    pub fn contract_address() -> Field { 15 }
    pub fn contract_leaf() -> Field { 16 }
    pub fn call_context() -> Field { 17 }
    pub fn call_stack_item() -> Field { 18 }
    pub fn call_stack_item_2() -> Field { 19 }
    pub fn l1_to_l2_message_secret() -> Field { 20 }
    pub fn l2_to_l1_msg() -> Field { 21 }
    pub fn tx_context() -> Field { 22 }
    pub fn public_leaf_index() -> Field { 23 }
    pub fn public_data_leaf() -> Field { 24 }
    pub fn signed_tx_request() -> Field { 25 }
    pub fn global_variables() -> Field { 26 }
    pub fn partial_address() -> Field { 27 }
    pub fn block_hash() -> Field { 28 }

    // Indices with size ≤ 16
    pub fn tx_request() -> Field { 33 }
    pub fn signature_payload() -> Field { 34 }

    // Indices with size ≤ 44
    pub fn vk() -> Field { 41 }
    pub fn private_circuit_public_inputs() -> Field { 42 }
    pub fn public_circuit_public_inputs() -> Field { 43 }
    pub fn function_args() -> Field { 44 }
}

struct StorageSlotGeneratorIndex;

impl StorageSlotGeneratorIndex {
    pub fn base_slot() -> Field { 0 }
    pub fn mapping_slot() -> Field { 1 }
    pub fn mapping_slot_placeholder() -> Field { 2 }
}

struct PrivateStateNoteGeneratorIndex;

impl PrivateStateNoteGeneratorIndex {
    pub fn value() -> Field { 1 }
    pub fn owner() -> Field { 2 }
    pub fn creator() -> Field { 3 }
    pub fn salt() -> Field { 4 }
    pub fn nonce() -> Field { 5 }
    pub fn memo() -> Field { 6 }
    pub fn is_dummy() -> Field { 7 }
}

struct PrivateStateType;

impl PrivateStateType {
    pub fn partitioned() -> Field { 1 }
    pub fn whole() -> Field { 2 }
}

pub fn l1_to_l2_message_length() -> Field { 8 }
pub fn l1_to_l2_message_oracle_call_length() -> Field { l1_to_l2_message_length() + l1_to_l2_msg_tree_height() + 1 + 1 }

pub fn max_note_fields_length() -> Field { 20 }
pub fn get_note_oracle_return_length() -> Field { max_note_fields_length() + 1 + 2 }
pub fn get_notes_oracle_return_length() -> Field { max_read_requests_per_call() * (max_note_fields_length() + 1) + 2 }
pub fn max_notes_per_page() -> Field { 10 }
pub fn view_note_oracle_return_length() -> Field { max_notes_per_page() * (max_note_fields_length() + 1) + 2 }

pub fn call_context_length() -> Field { 7 }
pub fn historic_block_data_length() -> Field { 7 }
pub fn function_data_length() -> Field { 4 }
pub fn contract_deployment_data_length() -> Field { 6 }

// For the following functions, I'm assuming that the functions for the constants like `l1_to_l2_msg_tree_height()`, 
// `max_read_requests_per_call()`, etc., are defined elsewhere. 
pub fn private_circuit_public_inputs_length() -> Field { 
    call_context_length() + 1  
    + return_values_length() + max_read_requests_per_call() + max_new_commitments_per_call()
    + 2 * max_new_nullifiers_per_call() + max_private_call_stack_length_per_call() 
    + max_public_call_stack_length_per_call() + max_new_l2_to_l1_msgs_per_call() 
    + num_fields_per_sha256() + num_fields_per_sha256() + 2 
    + historic_block_data_length() + contract_deployment_data_length() + 2 
}

pub fn private_circuit_public_inputs_hash_input_length() -> Field {
    1 + 1  
    + return_values_length() + max_read_requests_per_call() + max_new_commitments_per_call()
    + 2 * max_new_nullifiers_per_call() + max_private_call_stack_length_per_call() 
    + max_public_call_stack_length_per_call() + max_new_l2_to_l1_msgs_per_call() 
    + num_fields_per_sha256() + num_fields_per_sha256() + 2 
    + historic_block_data_length() + 3 
}

pub fn contract_storage_update_request_length() -> Field { 3 }
pub fn contract_storage_read_length() -> Field { 2 }

pub fn public_circuit_public_inputs_length() -> Field { 
    call_context_length() + 1 + return_values_length()
    + max_public_data_update_requests_per_call() * contract_storage_update_request_length()
    + max_public_data_reads_per_call() * contract_storage_read_length() + max_public_call_stack_length_per_call()
    + max_new_commitments_per_call() + max_new_nullifiers_per_call() + max_new_l2_to_l1_msgs_per_call()
    + num_fields_per_sha256() + 1 
    + historic_block_data_length() + 2 
}

pub fn public_circuit_public_inputs_hash_input_length() -> Field {
    2 + return_values_length() 
    + max_public_data_update_requests_per_call() + max_public_data_reads_per_call() + max_public_call_stack_length_per_call()
    + max_new_commitments_per_call() + max_new_nullifiers_per_call() + max_new_l2_to_l1_msgs_per_call()
    + num_fields_per_sha256() 
    + historic_block_data_length() + 2
}

pub fn call_private_function_return_size() -> Field {
    1 + function_data_length() + private_circuit_public_inputs_length() + 1
}

pub fn empty_nullified_commitment() -> Field { 1000000 }