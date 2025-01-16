use crate::{hash::hash_args_array, oracle::execution_cache};
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

    /// This is only used during private execution, since in public it is the VM itself that keeps track of return
    /// values.
    pub fn get_preimage<T, let N: u32>(self) -> T
    where
        T: Deserialize<N>,
    {
        /// Safety: We verify that the value returned by `load` is the preimage of `hash`, fully constraining it.
        let preimage: [Field; N] = unsafe { execution_cache::load(self.hash) };
        assert_eq(self.hash, hash_args_array(preimage));

        Deserialize::deserialize(preimage)
    }
}
