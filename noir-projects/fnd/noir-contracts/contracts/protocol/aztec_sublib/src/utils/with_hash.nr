use crate::protocol::{hash::poseidon2_hash, traits::Packable};

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
