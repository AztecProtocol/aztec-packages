use dep::protocol_types::{address::AztecAddress, traits::{Packable, ToField}};

#[oracle(storageRead)]
unconstrained fn storage_read_oracle<let N: u32>(
    address: Field,
    storage_slot: Field,
    block_number: u32,
    length: u32,
) -> [Field; N] {}

pub unconstrained fn raw_storage_read<let N: u32>(
    address: AztecAddress,
    storage_slot: Field,
    block_number: u32,
) -> [Field; N] {
    storage_read_oracle(address.to_field(), storage_slot, block_number, N)
}

pub unconstrained fn storage_read<T, let N: u32>(
    address: AztecAddress,
    storage_slot: Field,
    block_number: u32,
) -> T
where
    T: Packable<N>,
{
    T::unpack(raw_storage_read(address, storage_slot, block_number))
}

mod tests {
    use crate::oracle::storage::{raw_storage_read, storage_read};
    use dep::protocol_types::{address::AztecAddress, traits::{FromField, Packable}};

    use crate::test::mocks::mock_struct::MockStruct;
    use std::test::OracleMock;

    global address: AztecAddress = AztecAddress::from_field(29);
    global slot: Field = 7;
    global block_number: u32 = 17;

    #[test]
    unconstrained fn test_raw_storage_read() {
        let written = MockStruct { a: 13, b: 42 };

        let _ = OracleMock::mock("storageRead").returns(written.pack());

        let read: [Field; 2] = raw_storage_read(address, slot, block_number);
        assert_eq(read[0], 13);
        assert_eq(read[1], 42);
    }

    #[test]
    unconstrained fn test_storage_read() {
        let written = MockStruct { a: 13, b: 42 };

        let _ = OracleMock::mock("storageRead").returns(written.pack());

        let read: MockStruct = storage_read(address, slot, block_number);
        assert_eq(read.a, 13);
        assert_eq(read.b, 42);
    }
}
