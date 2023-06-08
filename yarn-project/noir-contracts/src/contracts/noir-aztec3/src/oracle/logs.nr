use crate::notes::value_note::Note;

#[oracle(emitEncryptedLog)]
fn emit_encrypted_log_oracle(
    _contract_address: Field, 
    _note: Note,
)  -> Field {}

unconstrained fn emit_encrypted_log(
    contract_address: Field, 
    note: Note,
) -> Field {
    emit_encrypted_log_oracle(
        contract_address, 
        note,
    )
}