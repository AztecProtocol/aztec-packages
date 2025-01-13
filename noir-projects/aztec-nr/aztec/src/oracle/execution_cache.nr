/// Stores values represented as slice in execution cache to be later obtained by its hash.
pub fn store(values: [Field]) {
    /// Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    /// to call. When loading the values, however, the caller must check that the values are indeed the preimage.
    unsafe { store_in_execution_cache_oracle_wrapper(values) };
}

/// Stores values represented as array in execution cache to be later obtained by its hash.
pub fn store_array<let N: u32>(values: [Field; N]) {
    /// Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    /// to call. When loading the values, however, the caller must check that the values are indeed the preimage.
    unsafe { store_array_in_execution_cache_oracle_wrapper(values) };
}

pub unconstrained fn store_in_execution_cache_oracle_wrapper(values: [Field]) {
    let _ = store_in_execution_cache_oracle(values);
}

pub unconstrained fn store_array_in_execution_cache_oracle_wrapper<let N: u32>(values: [Field; N]) {
    let _ = store_array_in_execution_cache_oracle(values);
}

pub unconstrained fn load<let N: u32>(hash: Field) -> [Field; N] {
    load_from_execution_cache_oracle(hash)
}

#[oracle(storeInExecutionCache)]
unconstrained fn store_in_execution_cache_oracle(_values: [Field]) -> Field {}

#[oracle(storeArrayInExecutionCache)]
unconstrained fn store_array_in_execution_cache_oracle<let N: u32>(_args: [Field; N]) -> Field {}

#[oracle(loadFromExecutionCache)]
unconstrained fn load_from_execution_cache_oracle<let N: u32>(_hash: Field) -> [Field; N] {}
