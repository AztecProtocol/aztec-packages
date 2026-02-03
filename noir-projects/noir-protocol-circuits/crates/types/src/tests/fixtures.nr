pub mod contract_functions;
pub mod contracts;
pub mod protocol_contracts;
pub mod vk_tree;
pub mod proof_data;
pub mod public_data_tree;

use crate::address::AztecAddress;

pub global MSG_SENDER: AztecAddress = AztecAddress { inner: 27 };

pub global CHAIN_ID: Field = 1;

pub global VERSION: Field = 3;

pub global GENESIS_TIMESTAMP: u64 = 1767225600;
