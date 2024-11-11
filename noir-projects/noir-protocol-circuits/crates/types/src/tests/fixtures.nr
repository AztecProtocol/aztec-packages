pub(crate) mod contract_functions;
pub(crate) mod contracts;
pub(crate) mod protocol_contract_tree;
pub(crate) mod vk_tree;

use crate::address::AztecAddress;

pub(crate) global MSG_SENDER = AztecAddress { inner: 27 };

pub(crate) global CHAIN_ID = 1;

pub(crate) global VERSION = 3;

