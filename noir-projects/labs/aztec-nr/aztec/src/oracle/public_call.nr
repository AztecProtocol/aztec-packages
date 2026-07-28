/// Validates public calldata by checking that the preimage exists and the cumulative size is within limits.
///
/// The check is unconstrained and the only purpose of it is to fail early in case of calldata overflow or a bug in
/// calldata hashing.
pub(crate) fn assert_valid_public_call_data(calldata_hash: Field) {
    // Safety: This oracle call returns nothing: we only call it for its side effects (validating the calldata).
    // It is therefore always safe to call.
    unsafe {
        assert_valid_public_call_data_oracle_wrapper(calldata_hash)
    }
}

unconstrained fn assert_valid_public_call_data_oracle_wrapper(calldata_hash: Field) {
    assert_valid_public_call_data_oracle(calldata_hash)
}

#[oracle(aztec_prv_assertValidPublicCalldata)]
unconstrained fn assert_valid_public_call_data_oracle(_calldata_hash: Field) {}
