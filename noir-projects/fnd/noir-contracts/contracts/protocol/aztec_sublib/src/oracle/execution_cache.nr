/// Stores values represented as slice in execution cache to be later obtained by its hash.
pub fn store<let N: u32>(values: [Field; N], hash: Field) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call. When loading the values, however, the caller must check that the values are indeed the preimage.
    unsafe { store_in_execution_cache_oracle_wrapper(values, hash) };
}

unconstrained fn store_in_execution_cache_oracle_wrapper<let N: u32>(values: [Field; N], hash: Field) {
    store_in_execution_cache_oracle(values, hash);
}

// TODO(F-498): review naming consistency
#[oracle(aztec_protocol_prv_setHashPreimage)]
unconstrained fn store_in_execution_cache_oracle<let N: u32>(_values: [Field; N], _hash: Field) {}
