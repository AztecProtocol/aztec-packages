use crate::{hash::hash_args_array, oracle::execution_cache};
use dep::protocol_types::traits::Deserialize;

/// A hash that represents a private contract function call's return value. Call `get_preimage` to get the underlying
/// value.
///
/// The kernels don't process the actual return values but instead their hashes, so it is up to contracts to populate
/// oracles with the preimages of these hashes on return to make them available to their callers.
///
/// Public calls don't utilize this mechanism since the AVM does process the full return values.
pub struct ReturnsHash {
    hash: Field,
}

impl ReturnsHash {
    pub fn new(hash: Field) -> Self {
        ReturnsHash { hash }
    }

    /// Fetches the underlying return value from an oracle, constraining that it corresponds to the return data hash.
    pub fn get_preimage<T>(self) -> T
    where
        T: Deserialize,
    {
        // Safety: We verify that the value returned by `load` is the preimage of `hash`, fully constraining it. If `T`
        // is `()`, then `preimage` must be an array of length 0 (since that is `()`'s deserialization length).
        // `hash_args_array` handles empty arrays following the protocol rules (i.e. an empty args array is signaled
        // with a zero hash), correctly constraining `self.hash`.
        let preimage = unsafe { execution_cache::load(self.hash) };
        assert_eq(self.hash, hash_args_array(preimage), "Preimage mismatch");

        Deserialize::deserialize(preimage)
    }
}

mod test {
    use crate::{
        hash::hash_args_array,
        oracle::execution_cache,
        test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct},
    };
    use super::ReturnsHash;
    use protocol_types::traits::Serialize;
    use std::test::OracleMock;

    #[test]
    unconstrained fn retrieves_preimage() {
        let env = TestEnvironment::new();
        env.private_context(|_| {
            let value = MockStruct::new(4, 7);
            let serialized = value.serialize();

            let hash = hash_args_array(serialized);
            execution_cache::store(serialized, hash);

            assert_eq(ReturnsHash::new(hash).get_preimage(), value);
        });
    }

    #[test]
    unconstrained fn retrieves_empty_preimage() {
        let env = TestEnvironment::new();
        env.private_context(|_| {
            let value = ();
            let serialized = [];

            let hash = hash_args_array(serialized);
            execution_cache::store(serialized, hash);

            assert_eq(ReturnsHash::new(hash).get_preimage(), value);
        });
    }

    #[test(should_fail_with = "Preimage mismatch")]
    unconstrained fn rejects_bad_preimage() {
        let value = MockStruct::new(4, 7);
        let serialized = value.serialize();

        let mut bad_serialized = serialized;
        bad_serialized[0] += 1;

        let hash = hash_args_array(serialized);

        let _ = OracleMock::mock("privateLoadFromExecutionCache").returns(bad_serialized);
        assert_eq(ReturnsHash::new(hash).get_preimage(), value);
    }

    // This test passes due to a Noir bug.
    // #[test(should_fail_with="Preimage mismatch")]
    // unconstrained fn rejects_bad_empty_preimage() {
    //     let value = ();
    //     let serialized = [];

    //     let hash = hash_args_array(serialized);

    //     let _ = OracleMock::mock("privateLoadFromExecutionCache").returns([1]);
    //     assert_eq(ReturnsHash::new(hash).get_preimage(), value);
    // }
}
