use dep::protocol_types::address::AztecAddress;

/// The below only exists to broadcast the raw log, so we can provide it to the base rollup later to be constrained.
pub unconstrained fn emit_contract_class_unencrypted_log_private<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    counter: u32,
) {
    emit_contract_class_unencrypted_log_private_oracle(contract_address, message, counter)
}

#[oracle(emitContractClassLog)]
unconstrained fn emit_contract_class_unencrypted_log_private_oracle<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    counter: u32,
) {}
