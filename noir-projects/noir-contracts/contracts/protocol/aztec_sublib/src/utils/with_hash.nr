use crate::{
    context::{PublicContext, UtilityContext},
    history::storage::public_storage_historical_read,
    oracle,
};
use crate::protocol::{
    abis::block_header::BlockHeader, address::AztecAddress, hash::poseidon2_hash, traits::Packable,
};

/// A struct that allows for efficient reading of value `T` from public storage in private.
///
/// The efficient reads are achieved by verifying large values through a single hash check and then proving inclusion
/// only of the hash in public storage. This reduces the number of required tree inclusion proofs from `M` to 1.
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

    /// Reads the value stored in this [WithHash] from public storage.
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
        header_to_read_from: BlockHeader,
        address: AztecAddress,
        storage_slot: Field,
    ) -> T {
        // We could simply produce historical inclusion proofs for each field in `packed`, but that would require one
        // full sibling path per storage slot. Instead, we get an oracle to provide us the values, and instead we prove
        // inclusion of their hash, which is both a much smaller proof (a single slot), and also independent of the
        // size of T.
        let hint = WithHash::new(
            // Safety: We verify that a hash of the hint/packed data matches the stored hash.
            unsafe { oracle::storage::storage_read(header_to_read_from, address, storage_slot) },
        );

        // The actual `value` (of type T, of packed length M fields) is stored in contiguous fields from the
        // `storage_slot`. The _hash_ of the `value` is stored at the end, at slot: `storage_slot + M`.
        let hash =
            public_storage_historical_read(header_to_read_from, storage_slot + M as Field, address);

        if hash != 0 {
            assert_eq(hash, hint.get_hash(), "Hint values do not match hash");
        } else {
            // The hash slot can only hold a zero if it is uninitialized. Therefore, the hints must then be zero (i.e.
            // the default value for public storage) as well.
            assert_eq(
                hint.get_value(),
                T::unpack(std::mem::zeroed()),
                "Non-zero hint for zero hash",
            );
        };

        hint.get_value()
    }
}

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
