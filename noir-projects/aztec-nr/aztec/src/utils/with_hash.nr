use crate::{
    context::{PublicContext, UtilityContext},
    history::public_storage::PublicStorageHistoricalRead,
    oracle,
};
use dep::protocol_types::{
    abis::block_header::BlockHeader, address::AztecAddress, hash::poseidon2_hash, traits::Packable,
};

/// A struct that allows for efficient reading of value `T` from public storage in private.
///
/// The efficient reads are achieved by verifying large values through a single hash check
/// and then proving inclusion only of the hash in public storage. This reduces the number
/// of required tree inclusion proofs from `N` to 1.
///
/// # Type Parameters
/// - `T`: The underlying type being wrapped, must implement `Packable<N>`
/// - `N`: The number of field elements required to pack values of type `T`
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

    pub unconstrained fn utility_public_storage_read(
        context: UtilityContext,
        storage_slot: Field,
    ) -> T {
        context.storage_read(storage_slot)
    }

    pub fn historical_public_storage_read(
        header: BlockHeader,
        address: AztecAddress,
        storage_slot: Field,
    ) -> T {
        let historical_block_number = header.global_variables.block_number;

        // We could simply produce historical inclusion proofs for each field in `packed`, but that would require one
        // full sibling path per storage slot (since due to kernel siloing the storage is not contiguous). Instead, we
        // get an oracle to provide us the values, and instead we prove inclusion of their hash, which is both a much
        // smaller proof (a single slot), and also independent of the size of T (except in that we need to pack and hash T).
        let hint = WithHash::new(
            // Safety: We verify that a hash of the hint/packed data matches the stored hash.
            unsafe {
                oracle::storage::storage_read(address, storage_slot, historical_block_number)
            },
        );

        let hash = header.public_storage_historical_read(storage_slot + N as Field, address);

        if hash != 0 {
            assert_eq(hash, hint.get_hash(), "Hint values do not match hash");
        } else {
            // The hash slot can only hold a zero if it is uninitialized. Therefore, the hints must then be zero
            // (i.e. the default value for public storage) as well.
            assert_eq(
                hint.get_value(),
                T::unpack(std::mem::zeroed()),
                "Non-zero hint for zero hash",
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
    use crate::{
        oracle::random::random,
        test::{
            helpers::{test_environment::TestEnvironment, txe_oracles},
            mocks::mock_struct::MockStruct,
        },
        utils::with_hash::WithHash,
    };
    use dep::protocol_types::hash::poseidon2_hash;
    use dep::protocol_types::traits::{Packable, ToField};
    use dep::std::{mem, test::OracleMock};

    global storage_slot: Field = 47;

    #[test]
    unconstrained fn create_and_recover() {
        let value = MockStruct { a: 5, b: 3 };
        let value_with_hash = WithHash::new(value);
        let recovered = WithHash::unpack(value_with_hash.pack());

        assert_eq(recovered.value, value);
        assert_eq(recovered.packed, value.pack());
        assert_eq(recovered.hash, poseidon2_hash(value.pack()));
    }

    #[test]
    unconstrained fn read_uninitialized_value() {
        let mut env = TestEnvironment::new();

        let block_header = env.private().historical_header;
        let address = env.contract_address();

        let result = WithHash::<MockStruct, _>::historical_public_storage_read(
            block_header,
            address,
            storage_slot,
        );

        // We should get zeroed value
        let expected: MockStruct = mem::zeroed();
        assert_eq(result, expected);
    }

    #[test]
    unconstrained fn read_initialized_value() {
        let mut env = TestEnvironment::new();

        let value = MockStruct { a: 5, b: 3 };
        let value_with_hash = WithHash::new(value);

        // We write the value with hash to storage
        txe_oracles::direct_storage_write(
            env.contract_address(),
            storage_slot,
            value_with_hash.pack(),
        );

        // We advance block by 1 because env.private() currently returns context at latest_block - 1
        env.mine_block();

        let result = WithHash::<MockStruct, _>::historical_public_storage_read(
            env.private().historical_header,
            env.contract_address(),
            storage_slot,
        );

        assert_eq(result, value);
    }

    #[test(should_fail_with = "Non-zero hint for zero hash")]
    unconstrained fn bad_hint_uninitialized_value() {
        let mut env = TestEnvironment::new();

        env.mine_block();

        let value_packed = MockStruct { a: 1, b: 1 }.pack();

        let block_header = env.private().historical_header;
        let address = env.contract_address();

        // Mock the oracle to return a non-zero hint/packed value
        let _ = OracleMock::mock("storageRead")
            .with_params((
                address.to_field(), storage_slot, block_header.global_variables.block_number,
                value_packed.len(),
            ))
            .returns(value_packed)
            .times(1);

        // This should revert because the hint value is non-zero and the hash is zero (default value of storage)
        let _ = WithHash::<MockStruct, _>::historical_public_storage_read(
            block_header,
            address,
            storage_slot,
        );
    }

    #[test(should_fail_with = "Hint values do not match hash")]
    unconstrained fn bad_hint_initialized_value() {
        let mut env = TestEnvironment::new();

        let value_packed = MockStruct { a: 5, b: 3 }.pack();

        // We write the value to storage
        txe_oracles::direct_storage_write(env.contract_address(), storage_slot, value_packed);

        // Now we write incorrect hash to the hash storage slot
        let incorrect_hash = random();
        let hash_storage_slot = storage_slot + (value_packed.len() as Field);
        txe_oracles::direct_storage_write(
            env.contract_address(),
            hash_storage_slot,
            [incorrect_hash],
        );

        // We advance block by 1 because env.private() currently returns context at latest_block - 1
        env.mine_block();

        let _ = WithHash::<MockStruct, _>::historical_public_storage_read(
            env.private().historical_header,
            env.contract_address(),
            storage_slot,
        );
    }
}
