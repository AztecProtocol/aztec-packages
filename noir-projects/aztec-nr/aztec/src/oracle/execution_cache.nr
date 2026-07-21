/// Stores values represented as slice in execution cache to be later obtained by its hash.
// TODO(F-498): review naming consistency
pub fn store<let N: u32>(values: [Field; N], hash: Field) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call. When loading the values, however, the caller must check that the values are indeed the preimage.
    unsafe { set_hash_preimage_oracle_wrapper(values, hash) };
}

unconstrained fn set_hash_preimage_oracle_wrapper<let N: u32>(values: [Field; N], hash: Field) {
    set_hash_preimage_oracle(values, hash);
}

// TODO(F-498): review naming consistency
pub unconstrained fn load<let N: u32>(hash: Field) -> [Field; N] {
    get_hash_preimage_oracle(hash)
}

#[oracle(aztec_prv_setHashPreimage)]
unconstrained fn set_hash_preimage_oracle<let N: u32>(_values: [Field; N], _hash: Field) {}

#[oracle(aztec_prv_getHashPreimage)]
unconstrained fn get_hash_preimage_oracle<let N: u32>(_hash: Field) -> [Field; N] {}
