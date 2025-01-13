use crate::{hash::hash_args_array, oracle::returns::get_returns};
use dep::protocol_types::traits::Deserialize;

pub struct ReturnsHash {
    hash: Field,
}

impl ReturnsHash {
    pub fn new(hash: Field) -> Self {
        ReturnsHash { hash }
    }

    pub fn assert_empty(self) {
        assert_eq(self.hash, 0);
    }

    pub fn raw(self) -> Field {
        self.hash
    }

    pub fn get_preimage<T, let N: u32>(self) -> T
    where
        T: Deserialize<N>,
    {
        // We verify that the value returned by `get_returns` is the preimage of `hash`, fully constraining
        // it.
        let unpacked: [Field; N] = unsafe { get_returns(self.hash) };
        assert_eq(self.hash, hash_args_array(unpacked));

        Deserialize::deserialize(unpacked)
    }
}
