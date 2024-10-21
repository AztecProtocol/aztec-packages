use dep::protocol_types::address::AztecAddress;

/// Informs the simulator that an encrypted note log has been emitted, helping it keep track of side-effects and easing
/// debugging.
pub fn emit_encrypted_note_log<let M: u32>(note_hash_counter: u32, encrypted_note: [u8; M], counter: u32) {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call.
    unsafe {
        emit_encrypted_note_log_oracle_wrapper(note_hash_counter, encrypted_note, counter)
    }
}

/// Informs the simulator that an encrypted event log has been emitted, helping it keep track of side-effects and easing
/// debugging.
pub fn emit_encrypted_event_log<let M: u32>(contract_address: AztecAddress, randomness: Field, encrypted_event: [u8; M], counter: u32) {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call.
    unsafe {
        emit_encrypted_event_log_oracle_wrapper(contract_address, randomness, encrypted_event, counter)
    }
}

/// Informs the simulator that an unencrypted log has been emitted, helping it keep track of side-effects and easing
/// debugging.
pub fn emit_unencrypted_log_private<T>(contract_address: AztecAddress, message: T, counter: u32) {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call.
    unsafe {
        emit_unencrypted_log_private_oracle_wrapper(contract_address, message, counter)
    }
}

unconstrained fn emit_encrypted_note_log_oracle_wrapper<let M: u32>(note_hash_counter: u32, encrypted_note: [u8; M], counter: u32) {
    emit_encrypted_note_log_oracle(note_hash_counter, encrypted_note, counter)
}

unconstrained fn emit_encrypted_event_log_oracle_wrapper<let M: u32>(
    contract_address: AztecAddress,
    randomness: Field,
    encrypted_event: [u8; M],
    counter: u32
) {
    emit_encrypted_event_log_oracle(contract_address, randomness, encrypted_event, counter)
}

unconstrained fn emit_unencrypted_log_private_oracle_wrapper<T>(contract_address: AztecAddress, message: T, counter: u32) {
    let _ = emit_unencrypted_log_private_oracle(contract_address, message, counter);
}

/// Temporary substitute for `emit_unencrypted_log_private` that is used for handling contract class registration. This
/// variant returns the log hash, which would be too large to compute inside a circuit.
pub unconstrained fn emit_contract_class_unencrypted_log_private<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    counter: u32
) -> Field {
    emit_contract_class_unencrypted_log_private_oracle(contract_address, message, counter)
}

// = 480 + 32 * N bytes
#[oracle(emitEncryptedNoteLog)]
unconstrained fn emit_encrypted_note_log_oracle<let M: u32>(
    _note_hash_counter: u32,
    _encrypted_note: [u8; M],
    _counter: u32
) {}

#[oracle(emitEncryptedEventLog)]
unconstrained fn emit_encrypted_event_log_oracle<let M: u32>(
    _contract_address: AztecAddress,
    _randomness: Field,
    _encrypted_event: [u8; M],
    _counter: u32
) {}

#[oracle(emitUnencryptedLog)]
unconstrained fn emit_unencrypted_log_private_oracle<T>(
    _contract_address: AztecAddress,
    _message: T,
    _counter: u32
) -> Field {}

#[oracle(emitContractClassUnencryptedLog)]
unconstrained fn emit_contract_class_unencrypted_log_private_oracle<let N: u32>(
    contract_address: AztecAddress,
    message: [Field; N],
    counter: u32
) -> Field {}
