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

/// Load M values from local PXE database. We pass in M as a parameter to have the information of how many fields
/// we need to pad if the key does not exist.
#[oracle(load)]
unconstrained fn load_oracle<let M: u32>(contract_address: AztecAddress, key: Field, num_return_values: u32) -> [Field; M] {}

/// Load a value of type T that implements Deserialize from local PXE database.
/// The data is scoped to the current contract.
/// If the key does not exist, an error is thrown.
pub unconstrained fn load<T, let N: u32>(contract_address: AztecAddress, key: Field) -> Option<T>
where
    T: Deserialize<N>,
{
    let fields: [Field; N + 1] = load_oracle(contract_address, key, N);
    // First field is a flag indicating if the key exists.
    if fields[0] == 0 {
        Option::none()
    } else if fields[0] == 1 {
        Option::some(T::deserialize(array::subarray(fields, 1)))
    } else {
        assert(false, "Invalid key-existence flag");
        Option::none()
    }
}

mod test {
    use crate::{
        oracle::{pxe_db::{load, store}, random::random},
        test::helpers::test_environment::TestEnvironment,
        utils::array,
    };

    #[test]
    unconstrained fn store_and_load_data() {
        let env = TestEnvironment::new();

        let contract_address = env.contract_address();
        let key = random();
        let values = [random(), random(), random(), random()];
        store(contract_address, key, values);

        let loaded_values = load::<[Field; 4], 4>(contract_address, key).unwrap();

        assert(loaded_values == values, "Stored and loaded values should be equal");
    }
}
