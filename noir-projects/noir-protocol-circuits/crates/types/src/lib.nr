//! Types and constants related to the Aztec protocol.

// Traits need to be first for the #[derive(...)] macro to work.
pub mod traits;

// The modules below are in a specific order that makes derivation of serde traits work.
pub mod address;
pub mod logging;
pub mod debug;
pub mod side_effect;
pub mod utils;
pub mod public_keys;
pub mod point;
pub mod scalar;
pub mod constants;
mod constants_tests;
pub mod contract_class_id;
pub mod merkle_tree;
pub mod contract_instance;
pub mod messaging;
pub mod poseidon2;
pub mod abis;

pub mod hash;
pub mod type_packing;

pub mod blob_data;

pub mod proof;
pub mod data;
pub mod storage;
pub mod validate;
pub mod meta;

pub mod delayed_public_mutable;

pub use abis::kernel_circuit_public_inputs::{
    PrivateKernelCircuitPublicInputs, PrivateToRollupKernelCircuitPublicInputs,
};
