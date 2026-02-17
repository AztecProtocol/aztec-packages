#[oracle(utilityGetAuthWitness)]
unconstrained fn get_auth_witness_oracle<let N: u32>(_message_hash: Field) -> [Field; N] {}

/// Oracle wrapper to fetch an `auth_witness` for a given `message_hash` from the PXE.
pub unconstrained fn get_auth_witness<let N: u32>(message_hash: Field) -> [Field; N] {
    get_auth_witness_oracle(message_hash)
}
