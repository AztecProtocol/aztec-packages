use crate::oracle::capsules;
use protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// A dynamically sized array backed by PXE's non-volatile database (called capsules). Values are persisted until
/// deleted, so they can be e.g. stored during simulation of a transaction and later retrieved during witness
/// generation. All values are scoped per contract address, so external contracts cannot access them.
pub struct CapsuleArray<T> {
    contract_address: AztecAddress,
    /// The base slot is where the array length is stored in capsules. Array elements are stored in consecutive slots
    /// after the base slot. For example, with base slot 5: the length is at slot 5, the first element (index 0) is at
    /// slot 6, the second element (index 1) is at slot 7, and so on.
    base_slot: Field,
}

impl<T> CapsuleArray<T> {
    /// Returns a CapsuleArray connected to a contract's capsules at a base slot. Array elements are stored in
    /// contiguous slots following the base slot, so there should be sufficient space between array base slots to
    /// accommodate elements. A reasonable strategy is to make the base slot a hash of a unique value.
    pub unconstrained fn at(contract_address: AztecAddress, base_slot: Field) -> Self {
        Self { contract_address, base_slot }
    }

    /// Returns the number of elements stored in the array.
    pub unconstrained fn len(self) -> u32 {
        // An uninitialized array defaults to a length of 0.
        capsules::load(self.contract_address, self.base_slot).unwrap_or(0) as u32
    }

    /// Stores a value at the end of the array.
    pub unconstrained fn push(self, value: T)
    where
        T: Serialize,
    {
        let current_length = self.len();

        // The slot corresponding to the index `current_length` is the first slot immediately after the end of the
        // array, which is where we want to place the new value.
        capsules::store(self.contract_address, self.slot_at(current_length), value);

        // Then we simply update the length.
        let new_length = current_length + 1;
        capsules::store(self.contract_address, self.base_slot, new_length);
    }

    /// Retrieves the value stored in the array at `index`. Throws if the index is out of bounds.
    pub unconstrained fn get(self, index: u32) -> T
    where
        T: Deserialize,
    {
        assert(index < self.len(), "Attempted to read past the length of a CapsuleArray");

        capsules::load(self.contract_address, self.slot_at(index)).unwrap()
    }

    /// Deletes the value stored in the array at `index`. Throws if the index is out of bounds.
    pub unconstrained fn remove(self, index: u32) {
        let current_length = self.len();
        assert(index < current_length, "Attempted to delete past the length of a CapsuleArray");

        // In order to be able to remove elements at arbitrary indices, we need to shift the entire contents of the
        // array past the removed element one slot backward so that we don't end up with a gap and preserve the
        // contiguous slots. We can skip this when deleting the last element however.
        if index != current_length - 1 {
            // The source and destination regions overlap, but `copy` supports this.
            capsules::copy(
                self.contract_address,
                self.slot_at(index + 1),
                self.slot_at(index),
                current_length - index - 1,
            );
        }

        // We can now delete the last element (which has either been copied to the slot immediately before it, or was
        // the element we meant to delete in the first place) and update the length.
        capsules::delete(self.contract_address, self.slot_at(current_length - 1));
        capsules::store(self.contract_address, self.base_slot, current_length - 1);
    }

    /// Iterates over the entire array, calling the callback with all values and their array index. The order in which
    /// values are processed is arbitrary.
    ///
    /// It is safe to delete the current element (and only the current element) from inside the callback via `remove`:
    /// ```noir
    /// array.for_each(|index, value| {
    ///   if some_condition(value) {
    ///     array.remove(index); // safe only for this index
    ///   }
    /// }
    /// ```
    ///
    /// If all elements in the array need to iterated over and then removed, then using `for_each` results in optimal
    /// efficiency.
    ///
    /// It is **not** safe to push new elements into the array from inside the callback.
    pub unconstrained fn for_each<Env>(self, f: unconstrained fn[Env](u32, T) -> ())
    where
        T: Deserialize,
    {
        // Iterating over all elements is simple, but we want to do it in such a way that a) deleting the current
        // element is safe to do, and b) deleting *all* elements is optimally efficient. This is because CapsuleArrays
        // are typically used to hold pending tasks, so iterating them while clearing completed tasks (sometimes
        // unconditionally, resulting in a full clear) is a very common access pattern.
        //
        // The way we achieve this is by iterating backwards: each element can always be deleted since it won't change
        // any preceding (lower) indices, and if every element is deleted then every element will (in turn) be the last
        // element. This results in an optimal full clear since `remove` will be able to skip the `capsules::copy` call
        // to shift any elements past the deleted one (because there will be none).
        let mut i = self.len();
        while i > 0 {
            i -= 1;
            f(i, self.get(i));
        }
    }

    unconstrained fn slot_at(self, index: u32) -> Field {
        // Elements are stored immediately after the base slot, so we add 1 to it to compute the slot for the first
        // element.
        self.base_slot + 1 + index as Field
    }
}

mod test {
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::CapsuleArray;
    use protocol_types::address::AztecAddress;

    global SLOT: Field = 1230;

    unconstrained fn setup() -> AztecAddress {
        TestEnvironment::new().utility().this_address()
    }

    #[test]
    unconstrained fn empty_array() {
        let contract_address = setup();

        let array: CapsuleArray<Field> = CapsuleArray::at(contract_address, SLOT);
        assert_eq(array.len(), 0);
    }

    #[test(should_fail_with = "Attempted to read past the length of a CapsuleArray")]
    unconstrained fn empty_array_read() {
        let contract_address = setup();

        let array = CapsuleArray::at(contract_address, SLOT);
        let _: Field = array.get(0);
    }

    #[test]
    unconstrained fn array_push() {
        let contract_address = setup();

        let array = CapsuleArray::at(contract_address, SLOT);
        array.push(5);

        assert_eq(array.len(), 1);
        assert_eq(array.get(0), 5);
    }

    #[test(should_fail_with = "Attempted to read past the length of a CapsuleArray")]
    unconstrained fn read_past_len() {
        let contract_address = setup();

        let array = CapsuleArray::at(contract_address, SLOT);
        array.push(5);

        let _ = array.get(1);
    }

    #[test]
    unconstrained fn array_remove_last() {
        let contract_address = setup();

        let array = CapsuleArray::at(contract_address, SLOT);

        array.push(5);
        array.remove(0);

        assert_eq(array.len(), 0);
    }

    #[test]
    unconstrained fn array_remove_some() {
        let contract_address = setup();

        let array = CapsuleArray::at(contract_address, SLOT);

        array.push(7);
        array.push(8);
        array.push(9);

        assert_eq(array.len(), 3);
        assert_eq(array.get(0), 7);
        assert_eq(array.get(1), 8);
        assert_eq(array.get(2), 9);

        array.remove(1);

        assert_eq(array.len(), 2);
        assert_eq(array.get(0), 7);
        assert_eq(array.get(1), 9);
    }

    #[test]
    unconstrained fn array_remove_all() {
        let contract_address = setup();

        let array = CapsuleArray::at(contract_address, SLOT);

        array.push(7);
        array.push(8);
        array.push(9);

        array.remove(1);
        array.remove(1);
        array.remove(0);

        assert_eq(array.len(), 0);
    }

    #[test]
    unconstrained fn for_each_called_with_all_elements() {
        let contract_address = setup();
        let array = CapsuleArray::at(contract_address, SLOT);

        array.push(4);
        array.push(5);
        array.push(6);

        // We store all values that we were called with and check that all (value, index) tuples are present. Note that
        // we do not care about the order in which each tuple was passed to the closure.
        let called_with = &mut BoundedVec::<(u32, Field), 3>::new();
        array.for_each(|index, value| { called_with.push((index, value)); });

        assert_eq(called_with.len(), 3);
        assert(called_with.any(|(index, value)| (index == 0) & (value == 4)));
        assert(called_with.any(|(index, value)| (index == 1) & (value == 5)));
        assert(called_with.any(|(index, value)| (index == 2) & (value == 6)));
    }

    #[test]
    unconstrained fn for_each_remove_some() {
        let contract_address = setup();
        let array = CapsuleArray::at(contract_address, SLOT);

        array.push(4);
        array.push(5);
        array.push(6);

        array.for_each(|index, _| {
            if index == 1 {
                array.remove(index);
            }
        });

        assert_eq(array.len(), 2);
        assert_eq(array.get(0), 4);
        assert_eq(array.get(1), 6);
    }

    #[test]
    unconstrained fn for_each_remove_all() {
        let contract_address = setup();
        let array = CapsuleArray::at(contract_address, SLOT);

        array.push(4);
        array.push(5);
        array.push(6);

        array.for_each(|index, _| { array.remove(index); });

        assert_eq(array.len(), 0);
    }

    // TODO: uncomment this test once OracleMock::count is implemented in the stdlib.
    // #[test]
    // unconstrained fn for_each_remove_all_no_copy() {
    //     let contract_address = setup();
    //     let array = CapsuleArray::at(contract_address, SLOT);

    //     array.push(4);
    //     array.push(5);
    //     array.push(6);

    //     // We test that the copyCapsule was never called, which is the expensive operation we want to avoid.
    //     let mock = OracleMock::mock("copyCapsule");

    //     array.for_each(|index, _| {
    //         array.remove(index);
    //     });

    //     assert_eq(mock.count(), 0);
    // }
}
