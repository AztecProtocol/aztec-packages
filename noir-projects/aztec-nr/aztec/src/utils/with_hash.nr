use crate::{context::{PublicContext, UnconstrainedContext}, oracle};
use dep::protocol_types::{
    address::AztecAddress,
    hash::poseidon2_hash,
    header::Header,
    traits::{Deserialize, Serialize},
};

pub struct WithHash<T, let N: u32> {
    value: T,
    serialized: [Field; N],
    hash: Field,
}

impl<T, let N: u32> WithHash<T, N>
where
    T: Serialize<N> + Deserialize<N> + Eq,
{
    pub fn new(value: T) -> Self {
        let serialized = value.serialize();
        Self { value, serialized, hash: poseidon2_hash(serialized) }
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

    unconstrained pub fn unconstrained_public_storage_read(context: UnconstrainedContext, storage_slot: Field) -> T {
        context.storage_read(storage_slot)
    }

    pub fn historical_public_storage_read(
        header: Header,
        address: AztecAddress,
        storage_slot: Field,
    ) -> T {
        let historical_block_number = header.global_variables.block_number as u32;

        // We could simply produce historical inclusion proofs for both the ScheduledValueChange and
        // ScheduledDelayChange, but that'd require one full sibling path per storage slot (since due to kernel siloing
        // the storage is not contiguous), and in the best case in which T is a single field that'd be 4 slots.
        // Instead, we get an oracle to provide us the correct values for both the value and delay changes, and instead
        // prove inclusion of their hash, which is both a much smaller proof (a single slot), and also independent of
        // the size of T.
        let with_hash = WithHash::new(
            unsafe {
                oracle::storage::storage_read(address, storage_slot, historical_block_number)
            },
        );

        // Ideally the following would be simply public_storage::read_historical, but we can't implement that yet.
        let hash = header.public_storage_historical_read(storage_slot + N as Field, address);

        if hash != 0 {
            assert_eq(hash, with_hash.get_hash(), "Hint values do not match hash");
        } else {
            // The hash slot can only hold a zero if it is uninitialized, meaning no value or delay change was ever
            // scheduled. Therefore, the hints must then correspond to uninitialized scheduled changes.
            assert_eq(
                with_hash.get_value(),
                T::deserialize(std::mem::zeroed()),
                "Non-zero value change for zero hash",
            );
        };

        with_hash.get_value()
    }
}

impl<T, let N: u32> Serialize<N + 1> for WithHash<T, N>
where
    T: Serialize<N>,
{
    fn serialize(self) -> [Field; N + 1] {
        let mut result: [Field; N + 1] = std::mem::zeroed();
        for i in 0..N {
            result[i] = self.serialized[i];
        }
        result[N] = self.hash;

        result
    }
}

impl<T, let N: u32> Deserialize<N + 1> for WithHash<T, N>
where
    T: Deserialize<N>,
{
    fn deserialize(serialized: [Field; N + 1]) -> Self {
        let mut value_serialized: [Field; N] = std::mem::zeroed();
        for i in 0..N {
            value_serialized[i] = serialized[i];
        }
        let hash = serialized[N];

        Self { value: T::deserialize(value_serialized), serialized: value_serialized, hash }
    }
}

mod test {
    use crate::test::mocks::mock_struct::MockStruct;
    use crate::utils::with_hash::WithHash;
    use dep::protocol_types::hash::poseidon2_hash;

    #[test]
    unconstrained fn create_and_recover() {
        let value = MockStruct { a: 5, b: 3 };
        let with_hash = WithHash::new(value);
        let recovered = WithHash::deserialize(with_hash.serialize());

        assert_eq(recovered.value, value);
        assert_eq(recovered.serialized, value.serialize());
        assert_eq(recovered.hash, poseidon2_hash(value.serialize()));
    }
}
