pub(crate) mod contract_functions;
pub(crate) mod contracts;
pub(crate) mod protocol_contract_tree;
pub(crate) mod vk_tree;

use crate::address::AztecAddress;

pub global MSG_SENDER: AztecAddress = AztecAddress { inner: 27 };

pub global CHAIN_ID: Field = 1;

pub global VERSION: Field = 3;

