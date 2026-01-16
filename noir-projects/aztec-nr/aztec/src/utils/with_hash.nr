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
/// of required tree inclusion proofs from `M` to 1.
///
/// # Type Parameters
/// - `T`: The underlying type being wrapped, must implement `Packable<N>`
/// - `M`: The number of field elements required to pack values of type `T`
pub struct WithHash<T, let M: u32> {
    value: T,
    packed: [Field; M],
    hash: Field,
}

impl<T, let M: u32> WithHash<T, M>
where
    T: Packable<N = M> + Eq,
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

        let hash = header.public_storage_historical_read(storage_slot + M as Field, address);

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

// Note: I don't derive Packable on `WithHash` because `derive_serialize` function does not support setting "N = M"
// as I do here 3 lines below. This could be worked around by placing the "where" clause directly on the `WithHash`
// struct, but Jake mentioned that the syntax is not expected to be supported at least until Noir 1.0.
// Relevant discussion on Slack:
// https://aztecprotocol.slack.com/archives/C04QF64EDNV/p1752593876160699?thread_ts=1752589887.955379&cid=C04QF64EDNV
impl<T, let M: u32> Packable for WithHash<T, M>
where
    T: Packable<N = M>,
{
    let N: u32 = M + 1;

    fn pack(self) -> [Field; Self::N] {
        let mut result: [Field; Self::N] = std::mem::zeroed();
        for i in 0..M {
            result[i] = self.packed[i];
        }
        result[M] = self.hash;

        result
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let mut value_packed = [0; M];
        for i in 0..M {
            value_packed[i] = packed[i];
        }
        let hash = packed[M];

        Self { value: T::unpack(value_packed), packed: value_packed, hash }
    }
}

mod test {
    use crate::{
        test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct},
        utils::with_hash::WithHash,
    };
    use dep::protocol_types::hash::poseidon2_hash;
    use dep::protocol_types::traits::{Packable, ToField};
    use dep::std::test::OracleMock;

    global STORAGE_SLOT: Field = 47;

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
        let env = TestEnvironment::new();

        env.private_context(|context| {
            let result = WithHash::<MockStruct, _>::historical_public_storage_read(
                context.anchor_block_header,
                context.this_address(),
                STORAGE_SLOT,
            );

            assert_eq(result, std::mem::zeroed());
        });
    }

    #[test]
    unconstrained fn read_initialized_value() {
        let env = TestEnvironment::new();

        let value = MockStruct { a: 5, b: 3 };
        let value_with_hash = WithHash::new(value);

        env.public_context(|context| { context.storage_write(STORAGE_SLOT, value_with_hash); });

        env.private_context(|context| {
            let result = WithHash::<MockStruct, _>::historical_public_storage_read(
                context.anchor_block_header,
                context.this_address(),
                STORAGE_SLOT,
            );
            assert_eq(result, value);
        });
    }

    #[test(should_fail_with = "Non-zero hint for zero hash")]
    unconstrained fn bad_hint_uninitialized_value() {
        let env = TestEnvironment::new();

        env.private_context(|context| {
            let block_header = context.anchor_block_header;
            let address = context.this_address();

            // Mock the oracle to return a non-zero hint/packed value
            let value_packed = MockStruct { a: 1, b: 1 }.pack();
            let _ = OracleMock::mock("utilityStorageRead")
                .with_params((
                    address.to_field(), STORAGE_SLOT, block_header.global_variables.block_number,
                    value_packed.len(),
                ))
                .returns(value_packed)
                .times(1);

            // This should fail because the hint value is non-zero and the hash is zero (default value of storage)
            let _ = WithHash::<MockStruct, _>::historical_public_storage_read(
                block_header,
                address,
                STORAGE_SLOT,
            );
        });
    }

    #[test(should_fail_with = "Hint values do not match hash")]
    unconstrained fn bad_hint_initialized_value() {
        let env = TestEnvironment::new();

        env.public_context(|context| {
            // Write the value and hash separately so that the hash is wrong
            let value = MockStruct { a: 5, b: 3 };
            context.storage_write(STORAGE_SLOT, value);

            let incorrect_hash = 13;
            let hash_storage_slot = STORAGE_SLOT + (value.pack().len() as Field);
            context.storage_write(hash_storage_slot, [incorrect_hash]);
        });

        env.private_context(|context| {
            let _ = WithHash::<MockStruct, _>::historical_public_storage_read(
                context.anchor_block_header,
                context.this_address(),
                STORAGE_SLOT,
            );
        });
    }
}
