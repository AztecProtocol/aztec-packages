#[oracle(store)]
unconstrained fn store_oracle<let N: u32>(key: Field, values: [Field; N]) -> Field {}

pub unconstrained fn store<let N: u32>(key: Field, values: [Field; N]) -> Field {
    store_oracle(key, values)
}

#[oracle(load)]
unconstrained fn load_oracle<let N: u32>(key: Field) -> [Field; N] {}

pub unconstrained fn load<let N: u32>(key: Field) -> [Field; N] {
    load_oracle(key)
}
