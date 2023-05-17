
// Utility function to console.log data in the acir simulator

#[oracle(emitData)]
fn emit_data_oracle(_msg: Field) -> Field {}

unconstrained fn emit_data(msg: Field) -> Field {
    emit_data_oracle(msg)
}