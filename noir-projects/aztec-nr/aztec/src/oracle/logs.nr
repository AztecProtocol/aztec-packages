use dep::protocol_types::address::AztecAddress;

/// Temporary substitute that is used for handling contract class registration. This
/// variant returns the log hash, which would be too large to compute inside a circuit.
pub unconstrained fn emit_contract_class_unencrypted_log_private<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    counter: u32,
) -> Field {
    emit_contract_class_unencrypted_log_private_oracle(contract_address, message, counter)
}

#[oracle(emitContractClassLog)]
unconstrained fn emit_contract_class_unencrypted_log_private_oracle<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    counter: u32,
) -> Field {}
