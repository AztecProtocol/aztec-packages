// A contract used along with `TransientChild` to test transient array sharing across same-contract frames and
// isolation across contracts.
use aztec::macros::aztec;

#[aztec]
pub contract TransientParent {
    use aztec::{macros::functions::external, protocol::address::AztecAddress, transient::TransientArray};

    use transient_child_contract::TransientChild;

    global TRANSIENT_SLOT: Field = 42;

    /// Appends a single value to the transient array at the shared slot.
    #[external("private")]
    fn appender() {
        // Safety: transient array operations are unconstrained oracle calls used here for testing sharing.
        unsafe {
            let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
            array.push(300);
        }
    }

    /// Pushes [100, 200], calls this same contract's `appender` (a nested frame of the same contract), then reads back.
    /// Because transient arrays are shared across frames of the same contract, the nested push must be visible here.
    #[external("private")]
    fn test_sharing() -> pub [Field; 4] {
        // Safety: transient array operations are unconstrained oracle calls used here for testing sharing.
        unsafe {
            let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
            array.push(100);
            array.push(200);
        }

        let _ = self.call_self.appender();

        // Safety: reading back the shared transient array after the nested same-contract call.
        unsafe {
            let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
            [array.len() as Field, array.get(0), array.get(1), array.get(2)]
        }
    }

    /// Pushes [100, 200], calls the child contract (which writes to the same slot in its own contract-scoped space),
    /// then verifies the parent's data is untouched.
    #[external("private")]
    fn test_isolation(child_address: AztecAddress) -> pub [Field; 3] {
        // Safety: transient array operations are unconstrained oracle calls used here for testing isolation.
        unsafe {
            let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
            array.push(100);
            array.push(200);
        }

        let _ = self.call(TransientChild::at(child_address).append_at_slot(TRANSIENT_SLOT));

        // Safety: reading back the parent's transient array to verify cross-contract isolation.
        unsafe {
            let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
            [array.len() as Field, array.get(0), array.get(1)]
        }
    }

    /// Appends a single value to the transient array at the shared slot from a utility frame, returning the new length.
    #[external("utility")]
    unconstrained fn appender_utility() -> Field {
        let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
        array.push(300);
        array.len() as Field
    }

    /// Pushes [100, 200] from a private frame, calls this same contract's `appender_utility` via
    /// `self.utility.call(...)` (a nested utility frame from a private caller), then reads back. Because the
    /// transient store is shared across the whole top-level PXE call (including the utility entered via
    /// `aztec_utl_callUtilityFunction`), the nested utility's push must be visible to the private caller.
    #[external("private")]
    fn test_sharing_with_utility() -> pub [Field; 4] {
        // Safety: transient array operations are unconstrained oracle calls used here for testing sharing.
        unsafe {
            let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
            array.push(100);
            array.push(200);
        }

        // Safety: utility calls from private are unconstrained and read off-chain state; here we just need the
        // side-effect on the shared transient store.
        let _ = unsafe { self.utility.call_self.appender_utility() };

        // Safety: reading back the shared transient array after the nested utility call.
        unsafe {
            let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
            [array.len() as Field, array.get(0), array.get(1), array.get(2)]
        }
    }

    /// Pushes [100, 200], calls this same contract's `appender_utility` (a nested utility frame), then reads back.
    /// Because transient arrays are shared across all frames of the same contract in one execution, the nested utility
    /// frame's push must be visible here.
    #[external("utility")]
    unconstrained fn sharing_via_utility() -> [Field; 4] {
        let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
        array.push(100);
        array.push(200);

        let _ = self.call(TransientParent::at(self.address).appender_utility());

        let array: TransientArray<Field> = TransientArray::at(TRANSIENT_SLOT);
        [array.len() as Field, array.get(0), array.get(1), array.get(2)]
    }
}

mod test {
    use crate::TransientParent;
    use aztec::test::helpers::test_environment::TestEnvironment;

    #[test]
    unconstrained fn transient_arrays_are_shared_across_same_contract_frames() {
        let mut env = TestEnvironment::new();
        let caller = env.create_light_account();

        let parent_address = env.deploy("TransientParent").without_initializer();

        let result: [Field; 4] = env.call_private(caller, TransientParent::at(parent_address).test_sharing());

        // The nested same-contract frame's push is visible: length 3, values [100, 200, 300].
        assert_eq(result[0], 3, "shared transient array length should be 3");
        assert_eq(result[1], 100, "transient array[0] should be 100");
        assert_eq(result[2], 200, "transient array[1] should be 200");
        assert_eq(result[3], 300, "transient array[2] should be 300 (written by nested same-contract frame)");
    }

    #[test]
    unconstrained fn transient_arrays_are_isolated_across_contracts() {
        let mut env = TestEnvironment::new();
        let caller = env.create_light_account();

        let parent_address = env.deploy("TransientParent").without_initializer();
        let child_address = env.deploy("@transient_child_contract/TransientChild").without_initializer();

        let result: [Field; 3] =
            env.call_private(caller, TransientParent::at(parent_address).test_isolation(child_address));

        // The child wrote to the same slot in its own contract-scoped space; the parent is untouched: [100, 200].
        assert_eq(result[0], 2, "parent transient array length should be 2");
        assert_eq(result[1], 100, "parent transient array[0] should be 100");
        assert_eq(result[2], 200, "parent transient array[1] should be 200");
    }

    #[test]
    unconstrained fn transient_arrays_are_shared_across_nested_utility_frames() {
        let mut env = TestEnvironment::new();

        let parent_address = env.deploy("TransientParent").without_initializer();

        let result: [Field; 4] = env.execute_utility(TransientParent::at(parent_address).sharing_via_utility());

        // The nested same-contract utility frame's push is visible: length 3, values [100, 200, 300].
        assert_eq(result[0], 3, "shared transient array length should be 3");
        assert_eq(result[1], 100, "transient array[0] should be 100");
        assert_eq(result[2], 200, "transient array[1] should be 200");
        assert_eq(result[3], 300, "transient array[2] should be 300 (written by nested utility frame)");
    }

    #[test]
    unconstrained fn transient_arrays_are_shared_from_private_into_nested_utility_frame() {
        let mut env = TestEnvironment::new();
        let caller = env.create_light_account();

        let parent_address = env.deploy("TransientParent").without_initializer();

        let result: [Field; 4] =
            env.call_private(caller, TransientParent::at(parent_address).test_sharing_with_utility());

        // The nested utility frame's push is visible to the private caller: length 3, values [100, 200, 300].
        assert_eq(result[0], 3, "shared transient array length should be 3");
        assert_eq(result[1], 100, "transient array[0] should be 100");
        assert_eq(result[2], 200, "transient array[1] should be 200");
        assert_eq(result[3], 300, "transient array[2] should be 300 (written by nested utility frame)");
    }
}
