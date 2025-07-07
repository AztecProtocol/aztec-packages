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
    pub fn get_preimage<T>(self) -> T
    where
        T: Deserialize,
    {
        // Safety: We verify that the value returned by `load` is the preimage of `hash`, fully constraining it.
        let preimage = unsafe { execution_cache::load::<<T as Deserialize>::N>(self.hash) };
        assert_eq(self.hash, hash_args_array(preimage));

        Deserialize::deserialize(preimage)
    }

    pub fn get_preimage_and_assert_empty<T>(self) -> T
    where
        T: Deserialize,
    {
        // Safety: We verify that the value returned by `load` is the preimage of `hash`, fully constraining it.
        let preimage: [Field; <T as Deserialize>::N] = unsafe { execution_cache::load(self.hash) };
        assert_eq(self.hash, hash_args_array(preimage));
        assert_eq(self.hash, 0);

        Deserialize::deserialize(preimage)
    }
}
