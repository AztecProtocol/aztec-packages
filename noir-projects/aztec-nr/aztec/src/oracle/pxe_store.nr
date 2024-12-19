#[oracle(store)]
unconstrained fn store_oracle<let N: u32>(key: Field, values: [Field; N]) -> Field {}

/// Store an array of values in local PXE database. The data is scoped to the current contract.
pub unconstrained fn store<let N: u32>(key: Field, values: [Field; N]) -> Field {
    store_oracle(key, values)
}

#[oracle(load)]
unconstrained fn load_oracle<let N: u32>(key: Field) -> [Field; N] {}

/// Load an array of values from local PXE database. The data is scoped to the current contract.
/// If the key does not exist, an error is thrown.
pub unconstrained fn load<let N: u32>(key: Field) -> [Field; N] {
    load_oracle(key)
}
