// The modules here are in a specific order that makes derivation of serde traits work.
pub mod append_only_tree_snapshot;
pub mod tree_snapshots;

pub mod public_call_request;

pub mod log;
pub mod private_log;

pub mod side_effect;
pub mod read_request;
pub mod public_log;
pub mod public_data_write;

pub mod log_hash;
pub mod note_hash;
pub mod nullifier;

pub mod function_selector;
pub mod function_data;
pub mod gas_fees;
pub mod gas;
pub mod gas_settings;
pub mod transaction;

pub mod global_variables;

pub mod call_context;
pub mod private_call_request;

pub mod accumulated_data;
pub mod avm_circuit_public_inputs;

pub mod partial_state_reference;
pub mod state_reference;
pub mod block_header;

pub mod contract_class_function_leaf_preimage;

pub mod note_hash_leaf_preimage;
pub mod nullifier_leaf_preimage;
pub mod protocol_contract_leaf_preimage;

pub mod tx_constant_data;
pub mod block_constant_data;
pub mod epoch_constant_data;

pub mod contract_class_log;

pub mod validation_requests;

pub mod private_kernel;
pub mod kernel_circuit_public_inputs;
pub mod private_kernel_data;

pub mod private_circuit_public_inputs;

pub mod sponge_blob;

pub mod tube;
