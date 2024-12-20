use protocol_types::traits::{Deserialize, Serialize};

#[oracle(store)]
unconstrained fn store_oracle<let N: u32>(key: Field, values: [Field; N]) {}

/// Store a value of type T that implements Serialize in local PXE database.
/// The data is scoped to the current contract.
pub unconstrained fn store<T, let N: u32>(key: Field, value: T)
where
    T: Serialize<N>,
{
    let serialized = value.serialize();
    store_oracle(key, serialized);
}

#[oracle(load)]
unconstrained fn load_oracle<let N: u32>(key: Field) -> [Field; N] {}

/// Load a value of type T that implements Deserialize from local PXE database.
/// The data is scoped to the current contract.
/// If the key does not exist, an error is thrown.
pub unconstrained fn load<T, let N: u32>(key: Field) -> T
where
    T: Deserialize<N>,
{
    let fields = load_oracle(key);
    T::deserialize(fields)
}
