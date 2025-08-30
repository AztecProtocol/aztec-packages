/// Stores values represented as slice in execution cache to be later obtained by its hash.
pub fn store(values: [Field], hash: Field) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call. When loading the values, however, the caller must check that the values are indeed the preimage.
    unsafe { store_in_execution_cache_oracle_wrapper(values, hash) };
}

unconstrained fn store_in_execution_cache_oracle_wrapper(values: [Field], hash: Field) {
    store_in_execution_cache_oracle(values, hash);
}

pub unconstrained fn load<let N: u32>(hash: Field) -> [Field; N] {
    load_from_execution_cache_oracle(hash)
}

#[oracle(privateStoreInExecutionCache)]
unconstrained fn store_in_execution_cache_oracle(_values: [Field], _hash: Field) {}

#[oracle(privateLoadFromExecutionCache)]
unconstrained fn load_from_execution_cache_oracle<let N: u32>(_hash: Field) -> [Field; N] {}
