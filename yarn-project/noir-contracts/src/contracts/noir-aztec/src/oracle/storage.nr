
#[oracle(storageRead)]
fn storage_read_oracle<N>(
    _storage_slot: Field,
) -> [Field; N] {}

unconstrained fn storage_read<T, N>(
    storage_slot: Field,
    deserialise: fn ([Field; N]) -> T,
) -> T {
    let fields = storage_read_oracle(storage_slot);
    deserialise(fields)
}

#[oracle(storageWrite)]
fn storage_write_oracle<T>(
    _storage_slot: Field,
    _value: T,
) -> [Field; 1] {}

unconstrained fn storage_write<N>(
    storage_slot: Field,
    fields: [Field; N]
) -> Field {
    storage_write_oracle(storage_slot, fields)[0]
}