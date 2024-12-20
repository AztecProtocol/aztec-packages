use crate::utils::array;
use protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

#[oracle(store)]
unconstrained fn store_oracle<let N: u32>(
    contract_address: AztecAddress,
    key: Field,
    values: [Field; N],
) {}

/// Store a value of type T that implements Serialize in local PXE database.
/// The data is scoped to the current contract.
pub unconstrained fn store<T, let N: u32>(contract_address: AztecAddress, key: Field, value: T)
where
    T: Serialize<N>,
{
    let serialized = value.serialize();
    store_oracle(contract_address, key, serialized);
}

#[oracle(load)]
unconstrained fn load_oracle<let M: u32>(contract_address: AztecAddress, key: Field) -> [Field; M] {}

/// Load a value of type T that implements Deserialize from local PXE database.
/// The data is scoped to the current contract.
/// If the key does not exist, an error is thrown.
pub unconstrained fn load<T, let N: u32>(contract_address: AztecAddress, key: Field) -> Option<T>
where
    T: Deserialize<N>,
{
    let fields: [Field; N + 1] = load_oracle(contract_address, key);
    // First field is a flag indicating if the key exists.
    if fields[0] == 0 {
        Option::none()
    } else if fields[0] == 1 {
        Option::some(T::deserialize(array::subarray(fields, 1)))
    } else {
        assert(false, "Invalid key-existence flag value");
        Option::none()
    }
}
