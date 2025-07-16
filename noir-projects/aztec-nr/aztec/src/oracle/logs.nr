use protocol_types::address::AztecAddress;

/// The below only exists to broadcast the raw log, so we can provide it to the base rollup later to be constrained.
pub unconstrained fn notify_created_contract_class_log<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    length: u32,
    counter: u32,
) {
    notify_created_contract_class_log_private_oracle(contract_address, message, length, counter)
}

#[oracle(notifyCreatedContractClassLog)]
unconstrained fn notify_created_contract_class_log_private_oracle<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    length: u32,
    counter: u32,
) {}
