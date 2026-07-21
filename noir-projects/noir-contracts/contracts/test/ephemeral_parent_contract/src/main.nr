// A contract used along with `EphemeralChild` to test ephemeral array isolation across nested call frames.
use aztec::macros::aztec;

#[aztec]
pub contract EphemeralParent {
    use aztec::{
        ephemeral::EphemeralArray,
        macros::functions::external,
        protocol::{abis::function_selector::FunctionSelector, address::AztecAddress},
    };

    global EPHEMERAL_SLOT: Field = 42;

    /// Populates an ephemeral array, calls the child contract (which writes to the same slot in its own
    /// frame), then verifies that the parent's data is untouched.
    #[external("private")]
    fn test_isolation(child_address: AztecAddress) -> pub [Field; 3] {
        // Safety: ephemeral array operations are unconstrained oracle calls used for testing isolation.
        unsafe {
            let array: EphemeralArray<Field> = EphemeralArray::at(EPHEMERAL_SLOT);
            array.push(100);
            array.push(200);
        }

        // Call the child's private function, which pushes to the same slot in its own frame.
        let child_selector = comptime { FunctionSelector::from_signature("use_ephemeral_at_slot(Field)") };
        let _ = self.context.call_private_function(child_address, child_selector, [EPHEMERAL_SLOT]);

        // Safety: reading back from the parent's ephemeral array to verify isolation.
        unsafe {
            let array: EphemeralArray<Field> = EphemeralArray::at(EPHEMERAL_SLOT);
            [array.len() as Field, array.get(0), array.get(1)]
        }
    }
}

mod test {
    use crate::EphemeralParent;
    use aztec::test::helpers::test_environment::TestEnvironment;

    #[test]
    unconstrained fn ephemeral_arrays_are_isolated_across_nested_private_calls() {
        let mut env = TestEnvironment::new();
        let caller = env.create_light_account();

        let parent_address = env.deploy("EphemeralParent").without_initializer();
        let child_address = env.deploy("@ephemeral_child_contract/EphemeralChild").without_initializer();

        let result: [Field; 3] =
            env.call_private(caller, EphemeralParent::at(parent_address).test_isolation(child_address));

        // The parent should still see its own data: length 2, values [100, 200].
        assert_eq(result[0], 2, "parent ephemeral array length should be 2");
        assert_eq(result[1], 100, "parent ephemeral array[0] should be 100");
        assert_eq(result[2], 200, "parent ephemeral array[1] should be 200");
    }
}
