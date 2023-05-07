mod abi;
mod context;
mod notes;
mod state_vars;
mod types;
mod utils;
mod private_call_stack_item;
mod public_call;

global NONCE_GENERATOR = 1;
global NOTE_HASH_GENERATOR = 2;
global NOTE_STORAGE_SLOT_GENERATOR = 3;
global MAPPING_STORAGE_SLOT_GENERATOR = 4;
global NULLIFIER_GENERATOR = 5;

global PRIVATE_DATA_TREE_HEIGHT: comptime Field = 8;
