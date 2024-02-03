use dep::protocol_types::address::{
    AztecAddress,
    EthAddress,
};

#[oracle(address)]
unconstrained pub  fn get_address() -> AztecAddress {}

#[oracle(storageAddress)]
unconstrained pub fn get_storage_address() -> AztecAddress {}

#[oracle(origin)]
unconstrained pub fn get_origin() -> AztecAddress {}

#[oracle(sender)]
unconstrained pub fn get_sender() -> AztecAddress {}

#[oracle(portal)]
unconstrained pub fn get_portal() -> EthAddress {}

#[oracle(feePerL1Gas)]
unconstrained pub fn get_fee_per_l1_gas() -> Field {}

#[oracle(feePerL2Gas)]
unconstrained pub fn get_fee_per_l2_gas() -> Field {}

#[oracle(feePerDaGas)]
unconstrained pub fn get_fee_per_da_gas() -> Field {}

#[oracle(chainId)]
unconstrained pub fn get_chain_id() -> Field {}

#[oracle(version)]
unconstrained pub fn get_version() -> Field {}

#[oracle(blockNumber)]
unconstrained pub fn get_block_number() -> Field {}

#[oracle(timestamp)]
unconstrained pub fn get_timestamp() -> Field {}

#[oracle(isStaticCall)]
unconstrained pub fn get_is_static_call() -> Field {}

#[oracle(isDelegateCall)]
unconstrained pub fn get_is_delegate_call() -> Field {}

// #[oracle(contractCallDepth)]
// unconstrained pub fn get_contract_call_depth() -> Field {}