use dep::protocol_types::{address::AztecAddress, traits::Deserialize};

#[oracle(storageRead)]
unconstrained fn storage_read_oracle<N>(
    storage_slot: Field,
    length: Field,
    address: Field,
    block_number: Field
) -> [Field; N] {}

unconstrained pub fn raw_storage_read<N>(
    storage_slot: Field,
    address: AztecAddress,
    block_number: u32
) -> [Field; N] {
    storage_read_oracle(storage_slot, N, address.to_field(), block_number as Field)
}

unconstrained pub fn storage_read<T, N>(
    storage_slot: Field,
    address: AztecAddress,
    block_number: u32
) -> T where T: Deserialize<N> {
    T::deserialize(raw_storage_read(storage_slot, address, block_number))
}

mod tests {
    use crate::oracle::storage::{raw_storage_read, storage_read};
    use dep::protocol_types::address::AztecAddress;

    use std::test::OracleMock;
    use crate::test::mocks::mock_struct::MockStruct;

    global slot = 7;
    global address = AztecAddress::from_field(29);
    global block_number = 17;

    #[test]
    fn test_raw_storage_read() {
        let written = MockStruct { a: 13, b: 42 };

        let _ = OracleMock::mock("storageRead").returns(written.serialize());

        let read: [Field; 2] = raw_storage_read(slot, address, block_number);
        assert_eq(read[0], 13);
        assert_eq(read[1], 42);
    }

    #[test]
    fn test_storage_read() {
        let written = MockStruct { a: 13, b: 42 };

        let _ = OracleMock::mock("storageRead").returns(written.serialize());

        let read: MockStruct = storage_read(slot, address, block_number);
        assert_eq(read.a, 13);
        assert_eq(read.b, 42);
    }
}
