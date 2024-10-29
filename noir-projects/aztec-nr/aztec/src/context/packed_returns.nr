use crate::{hash::hash_args_array, oracle::returns::unpack_returns};
use dep::protocol_types::traits::Deserialize;

pub struct PackedReturns {
    packed_returns: Field,
}

impl PackedReturns {
    pub fn new(packed_returns: Field) -> Self {
        PackedReturns { packed_returns }
    }

    pub fn assert_empty(self) {
        assert_eq(self.packed_returns, 0);
    }

    pub fn raw(self) -> Field {
        self.packed_returns
    }

    pub fn unpack<let N: u32>(self) -> [Field; N] {
        // We verify that the value returned by `unpack_returns` is the preimage of `packed_returns`, fully constraining
        // it.
        let unpacked: [Field; N] = unsafe { unpack_returns(self.packed_returns) };
        assert_eq(self.packed_returns, hash_args_array(unpacked));
        unpacked
    }

    pub fn unpack_into<T, let N: u32>(self) -> T
    where
        T: Deserialize<N>,
    {
        let unpacked: [Field; N] = self.unpack();
        Deserialize::deserialize(unpacked)
    }
}
