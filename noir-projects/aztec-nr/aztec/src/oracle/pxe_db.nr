use crate::utils::array;
use protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

#[oracle(store)]
unconstrained fn store_oracle<let N: u32>(
    contract_address: AztecAddress,
    key: Field,
    values: [Field; N],
) {}

/// Store a value of type T that implements Serialize in local PXE database. The data is scoped to the current
/// contract. If the data under the key already exists, it is overwritten.
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
unconstrained fn load_oracle<let M: u32>(
    contract_address: AztecAddress,
    key: Field,
    num_return_values: u32,
) -> [Field; M] {}

/// Load a value of type T that implements Deserialize from local PXE database. The data is scoped to the current
/// contract. If the key does not exist, Option::none() is returned.
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
        test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct},
    };

    #[test]
    unconstrained fn stores_loads_and_overwrites_data() {
        let env = TestEnvironment::new();

        let contract_address = env.contract_address();
        let key = random();
        let value = MockStruct::new(5, 6);
        store(contract_address, key, value);

        let loaded_value: MockStruct = load(contract_address, key).unwrap();

        assert(loaded_value == value, "Stored and loaded values should be equal");

        // Now we test that the value gets overwritten correctly.
        let new_value = MockStruct::new(7, 8);
        store(contract_address, key, new_value);

        let loaded_value: MockStruct = load(contract_address, key).unwrap();

        assert(loaded_value == new_value, "Stored and loaded values should be equal");
    }

    #[test]
    unconstrained fn load_non_existent_key() {
        let env = TestEnvironment::new();

        let contract_address = env.contract_address();
        let key = random();
        let loaded_value: Option<MockStruct> = load(contract_address, key);

        assert(loaded_value == Option::none(), "Value should not exist");
    }
}
