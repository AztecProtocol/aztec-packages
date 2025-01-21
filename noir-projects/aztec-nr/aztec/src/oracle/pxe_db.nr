use protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// Stores arbitrary information in a per-contract non-volatile database, which can later be retrieved with `load`. If
/// data was already stored at this slot, it is overwrriten.
pub unconstrained fn store<T, let N: u32>(contract_address: AztecAddress, slot: Field, value: T)
where
    T: Serialize<N>,
{
    let serialized = value.serialize();
    store_oracle(contract_address, slot, serialized);
}

/// Returns data previously stored via `dbStore` in the per-contract non-volatile database. Returns Option::none() if
/// nothing was stored at the given slot.
pub unconstrained fn load<T, let N: u32>(contract_address: AztecAddress, slot: Field) -> Option<T>
where
    T: Deserialize<N>,
{
    let serialized_option = load_oracle::<N>(contract_address, slot, N);
    serialized_option.map(|arr| Deserialize::deserialize(arr))
}

/// Deletes data in the per-contract non-volatile database. Does nothing if no data was present.
pub unconstrained fn delete(contract_address: AztecAddress, slot: Field) {
    delete_oracle(contract_address, slot);
}

/// Copies a number of contiguous entries in the per-contract non-volatile database. This allows for efficient data
/// structures by avoiding repeated calls to `dbLoad` and `dbStore`.
/// Supports overlapping source and destination regions (which will result in the overlapped source values being
/// overwritten). All copied slots must exist in the database (i.e. have been stored and not deleted)
pub unconstrained fn copy(
    contract_address: AztecAddress,
    src_slot: Field,
    dst_slot: Field,
    num_entries: u32,
) {
    copy_oracle(contract_address, src_slot, dst_slot, num_entries);
}

#[oracle(dbStore)]
unconstrained fn store_oracle<let N: u32>(
    contract_address: AztecAddress,
    slot: Field,
    values: [Field; N],
) {}

/// We need to pass in `array_len` (the value of N) as a parameter to tell the oracle how many fields the response must
/// have.
///
/// Note that the oracle returns an Option<[Field; N]> because we cannot return an Option<T> directly. That would
/// require for the oracle resolver to know the shape of T (e.g. if T were a struct of 3 u32 values then the expected
/// response shape would be 3 single items, whereas it were a struct containing `u32, [Field;10], u32` then the expected
/// shape would be single, array, single.). Instead, we return the serialization and deserialize in Noir.
#[oracle(dbLoad)]
unconstrained fn load_oracle<let N: u32>(
    contract_address: AztecAddress,
    slot: Field,
    array_len: u32,
) -> Option<[Field; N]> {}

#[oracle(dbDelete)]
unconstrained fn delete_oracle(contract_address: AztecAddress, slot: Field) {}

#[oracle(dbCopy)]
unconstrained fn copy_oracle(
    contract_address: AztecAddress,
    src_slot: Field,
    dst_slot: Field,
    num_entries: u32,
) {}

mod test {
    // These tests are sort of redundant since we already test the oracle implementation directly in TypeScript, but
    // they are cheap regardless and help ensure both that the TXE implementation works accordingly and that the Noir
    // oracles are hooked up correctly.

    use crate::{
        oracle::pxe_db::{copy, delete, load, store},
        test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct},
    };
    use protocol_types::{address::AztecAddress, traits::{FromField, ToField}};

    unconstrained fn setup() -> AztecAddress {
        let env = TestEnvironment::new();
        env.contract_address()
    }

    global SLOT: Field = 1;

    #[test]
    unconstrained fn stores_and_loads() {
        let contract_address = setup();

        let value = MockStruct::new(5, 6);
        store(contract_address, SLOT, value);

        assert_eq(load(contract_address, SLOT).unwrap(), value);
    }

    #[test]
    unconstrained fn store_overwrites() {
        let contract_address = setup();

        let value = MockStruct::new(5, 6);
        store(contract_address, SLOT, value);

        let new_value = MockStruct::new(7, 8);
        store(contract_address, SLOT, new_value);

        assert_eq(load(contract_address, SLOT).unwrap(), new_value);
    }

    #[test]
    unconstrained fn loads_empty_slot() {
        let contract_address = setup();

        let loaded_value: Option<MockStruct> = load(contract_address, SLOT);
        assert_eq(loaded_value, Option::none());
    }

    #[test]
    unconstrained fn deletes_stored_value() {
        let contract_address = setup();

        let value = MockStruct::new(5, 6);
        store(contract_address, SLOT, value);
        delete(contract_address, SLOT);

        let loaded_value: Option<MockStruct> = load(contract_address, SLOT);
        assert_eq(loaded_value, Option::none());
    }

    #[test]
    unconstrained fn deletes_empty_slot() {
        let contract_address = setup();

        delete(contract_address, SLOT);
        let loaded_value: Option<MockStruct> = load(contract_address, SLOT);
        assert_eq(loaded_value, Option::none());
    }

    #[test]
    unconstrained fn copies_non_overlapping_values() {
        let contract_address = setup();

        let src = 5;

        let values = [MockStruct::new(5, 6), MockStruct::new(7, 8), MockStruct::new(9, 10)];
        store(contract_address, src, values[0]);
        store(contract_address, src + 1, values[1]);
        store(contract_address, src + 2, values[2]);

        let dst = 10;
        copy(contract_address, src, dst, 3);

        assert_eq(load(contract_address, dst).unwrap(), values[0]);
        assert_eq(load(contract_address, dst + 1).unwrap(), values[1]);
        assert_eq(load(contract_address, dst + 2).unwrap(), values[2]);
    }

    #[test]
    unconstrained fn copies_overlapping_values_with_src_ahead() {
        let contract_address = setup();

        let src = 1;

        let values = [MockStruct::new(5, 6), MockStruct::new(7, 8), MockStruct::new(9, 10)];
        store(contract_address, src, values[0]);
        store(contract_address, src + 1, values[1]);
        store(contract_address, src + 2, values[2]);

        let dst = 2;
        copy(contract_address, src, dst, 3);

        assert_eq(load(contract_address, dst).unwrap(), values[0]);
        assert_eq(load(contract_address, dst + 1).unwrap(), values[1]);
        assert_eq(load(contract_address, dst + 2).unwrap(), values[2]);

        // src[1] and src[2] should have been overwritten since they are also dst[0] and dst[1]
        assert_eq(load(contract_address, src).unwrap(), values[0]); // src[0] (unchanged)
        assert_eq(load(contract_address, src + 1).unwrap(), values[0]); // dst[0]
        assert_eq(load(contract_address, src + 2).unwrap(), values[1]); // dst[1]
    }

    #[test]
    unconstrained fn copies_overlapping_values_with_dst_ahead() {
        let contract_address = setup();

        let src = 2;

        let values = [MockStruct::new(5, 6), MockStruct::new(7, 8), MockStruct::new(9, 10)];
        store(contract_address, src, values[0]);
        store(contract_address, src + 1, values[1]);
        store(contract_address, src + 2, values[2]);

        let dst = 1;
        copy(contract_address, src, dst, 3);

        assert_eq(load(contract_address, dst).unwrap(), values[0]);
        assert_eq(load(contract_address, dst + 1).unwrap(), values[1]);
        assert_eq(load(contract_address, dst + 2).unwrap(), values[2]);

        // src[0] and src[1] should have been overwritten since they are also dst[1] and dst[2]
        assert_eq(load(contract_address, src).unwrap(), values[1]); // dst[1]
        assert_eq(load(contract_address, src + 1).unwrap(), values[2]); // dst[2]
        assert_eq(load(contract_address, src + 2).unwrap(), values[2]); // src[2] (unchanged)
    }

    #[test(should_fail_with = "copy empty slot")]
    unconstrained fn cannot_copy_empty_values() {
        let contract_address = setup();

        copy(contract_address, SLOT, SLOT, 1);
    }

    #[test(should_fail_with = "not allowed to access")]
    unconstrained fn cannot_store_other_contract() {
        let contract_address = setup();
        let other_contract_address = AztecAddress::from_field(contract_address.to_field() + 1);

        let value = MockStruct::new(5, 6);
        store(other_contract_address, SLOT, value);
    }

    #[test(should_fail_with = "not allowed to access")]
    unconstrained fn cannot_load_other_contract() {
        let contract_address = setup();
        let other_contract_address = AztecAddress::from_field(contract_address.to_field() + 1);

        let _: Option<MockStruct> = load(other_contract_address, SLOT);
    }

    #[test(should_fail_with = "not allowed to access")]
    unconstrained fn cannot_delete_other_contract() {
        let contract_address = setup();
        let other_contract_address = AztecAddress::from_field(contract_address.to_field() + 1);

        delete(other_contract_address, SLOT);
    }

    #[test(should_fail_with = "not allowed to access")]
    unconstrained fn cannot_copy_other_contract() {
        let contract_address = setup();
        let other_contract_address = AztecAddress::from_field(contract_address.to_field() + 1);

        copy(other_contract_address, SLOT, SLOT, 0);
    }
}
