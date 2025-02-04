use crate::{
    context::{PublicContext, UnconstrainedContext},
    history::public_storage::PublicStorageHistoricalRead,
    oracle,
};
use dep::protocol_types::{
    address::AztecAddress, block_header::BlockHeader, hash::poseidon2_hash, traits::Packable,
};

pub struct WithHash<T, let N: u32> {
    value: T,
    packed: [Field; N],
    hash: Field,
}

impl<T, let N: u32> WithHash<T, N>
where
    T: Packable<N> + Eq,
{
    pub fn new(value: T) -> Self {
        let packed = value.pack();
        Self { value, packed, hash: poseidon2_hash(packed) }
    }

    pub fn get_value(self) -> T {
        self.value
    }

    pub fn get_hash(self) -> Field {
        self.hash
    }

    pub fn public_storage_read(context: PublicContext, storage_slot: Field) -> T {
        context.storage_read(storage_slot)
    }

    pub unconstrained fn unconstrained_public_storage_read(
        context: UnconstrainedContext,
        storage_slot: Field,
    ) -> T {
        context.storage_read(storage_slot)
    }

    pub fn historical_public_storage_read(
        header: BlockHeader,
        address: AztecAddress,
        storage_slot: Field,
    ) -> T {
        let historical_block_number = header.global_variables.block_number as u32;

        // We could simply produce historical inclusion proofs for each field in `packed`, but that would require one
        // full sibling path per storage slot (since due to kernel siloing the storage is not contiguous). Instead, we
        // get an oracle to provide us the values, and instead we prove inclusion of their hash, which is both a much
        // smaller proof (a single slot), and also independent of the size of T (except in that we need to pack and hash T).
        let hint = WithHash::new(
            /// Safety: We verify that a hash of the hint/packed data matches the stored hash.
            unsafe {
                oracle::storage::storage_read(address, storage_slot, historical_block_number)
            },
        );

        // Ideally the following would be simply public_storage::read_historical, but we can't implement that yet.
        let hash = header.public_storage_historical_read(storage_slot + N as Field, address);

        if hash != 0 {
            assert_eq(hash, hint.get_hash(), "Hint values do not match hash");
        } else {
            // The hash slot can only hold a zero if it is uninitialized. Therefore, the hints must then be zero
            // (i.e. the default value for public storage) as well.
            assert_eq(
                hint.get_value(),
                T::unpack(std::mem::zeroed()),
                "Non-zero value change for zero hash",
            );
        };

        hint.get_value()
    }
}

impl<T, let N: u32> Packable<N + 1> for WithHash<T, N>
where
    T: Packable<N>,
{
    fn pack(self) -> [Field; N + 1] {
        let mut result: [Field; N + 1] = std::mem::zeroed();
        for i in 0..N {
            result[i] = self.packed[i];
        }
        result[N] = self.hash;

        result
    }

    fn unpack(packed: [Field; N + 1]) -> Self {
        let mut value_packed: [Field; N] = std::mem::zeroed();
        for i in 0..N {
            value_packed[i] = packed[i];
        }
        let hash = packed[N];

        Self { value: T::unpack(value_packed), packed: value_packed, hash }
    }
}

mod test {
    use crate::test::mocks::mock_struct::MockStruct;
    use crate::utils::with_hash::WithHash;
    use dep::protocol_types::hash::poseidon2_hash;

    #[test]
    unconstrained fn create_and_recover() {
        let value = MockStruct { a: 5, b: 3 };
        let value_with_hash = WithHash::new(value);
        let recovered = WithHash::unpack(value_with_hash.pack());

        assert_eq(recovered.value, value);
        assert_eq(recovered.packed, value.pack());
        assert_eq(recovered.hash, poseidon2_hash(value.pack()));
    }
}
