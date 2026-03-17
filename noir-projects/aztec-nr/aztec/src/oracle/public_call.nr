/// Validates public calldata by checking that the preimage exists and the cumulative size is within limits.
///
/// The check is unconstrained and the only purpose of it is to fail early in case of calldata overflow or a bug in
/// calldata hashing.
pub(crate) fn validate_public_calldata(calldata_hash: Field) {
    // Safety: This oracle call returns nothing: we only call it for its side effects (validating the calldata).
    // It is therefore always safe to call.
    unsafe {
        validate_public_calldata_wrapper(calldata_hash)
    }
}

unconstrained fn validate_public_calldata_wrapper(calldata_hash: Field) {
    validate_public_calldata_oracle(calldata_hash)
}

#[oracle(aztec_prv_validatePublicCalldata)]
unconstrained fn validate_public_calldata_oracle(_calldata_hash: Field) {}
