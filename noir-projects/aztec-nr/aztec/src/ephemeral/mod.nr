use crate::oracle::ephemeral;
use crate::oracle::random::random;
use crate::protocol::traits::{Deserialize, Serialize};
use crate::protocol::utils::{reader::Reader, writer::Writer};

/// A dynamically sized array that exists only during a single contract call frame.
///
/// Ephemeral arrays are backed by in-memory storage on the PXE side rather than a persistent database. Each contract
/// call frame gets its own isolated slot space of ephemeral arrays. Child simulations cannot see the parent's
/// ephemeral arrays, and vice versa.
///
/// Each logical array operation (push, pop, get, etc.) is a single oracle call, making ephemeral arrays significantly
/// cheaper than capsule arrays.
///
/// ## Use Cases
///
/// Ephemeral arrays are designed for passing data between PXE (TypeScript) and contracts (Noir) during simulation,
/// for example, note validation requests or event validation responses. This data type is appropriate for data that
/// is not supposed to be persisted.
///
/// For data that needs to persist across simulations, contract calls, etc, use
/// [`CapsuleArray`](crate::capsules::CapsuleArray) instead.
///
/// For data that must be shared across all frames of the same contract (private and utility) within one top-level PXE
/// call (transaction simulation or utility call) but not persisted, use
/// [`TransientArray`](crate::transient::TransientArray).
pub struct EphemeralArray<T> {
    pub slot: Field,
}

impl<T> EphemeralArray<T> {
    /// Returns a handle to an ephemeral array at the given slot, which may already contain data (e.g. populated
    /// by an oracle).
    pub unconstrained fn at(slot: Field) -> Self {
        Self { slot }
    }

    /// Returns an empty ephemeral array at the given slot, clearing any pre-existing data.
    pub unconstrained fn empty_at(slot: Field) -> Self {
        Self::at(slot).clear()
    }

    /// Returns an empty ephemeral array at a fresh, randomly allocated slot.
    ///
    /// Use this when the caller does not need a specific slot: the random slot is isolated from every other ephemeral
    /// array with overwhelming probability. Prefer [`EphemeralArray::empty_at`] when the slot must be a known value
    /// (e.g. one shared with an oracle).
    pub unconstrained fn empty() -> Self {
        Self::empty_at(random())
    }

    /// Returns the number of elements stored in the array.
    pub unconstrained fn len(self) -> u32 {
        ephemeral::len_oracle(self.slot)
    }

    /// Stores a value at the end of the array.
    pub unconstrained fn push(self, value: T)
    where
        T: Serialize,
    {
        let serialized = value.serialize();
        let _ = ephemeral::push_oracle(self.slot, serialized);
    }

    /// Removes and returns the last element. Panics if the array is empty.
    pub unconstrained fn pop(self) -> T
    where
        T: Deserialize,
    {
        let serialized = ephemeral::pop_oracle(self.slot);
        Deserialize::deserialize(serialized)
    }

    /// Retrieves the value stored at `index`. Panics if the index is out of bounds.
    pub unconstrained fn get(self, index: u32) -> T
    where
        T: Deserialize,
    {
        let serialized = ephemeral::get_oracle(self.slot, index);
        Deserialize::deserialize(serialized)
    }

    /// Overwrites the value stored at `index`. Panics if the index is out of bounds.
    pub unconstrained fn set(self, index: u32, value: T)
    where
        T: Serialize,
    {
        let serialized = value.serialize();
        ephemeral::set_oracle(self.slot, index, serialized);
    }

    /// Removes the element at `index`, shifting subsequent elements backward. Panics if out of bounds.
    pub unconstrained fn remove(self, index: u32) {
        ephemeral::remove_oracle(self.slot, index);
    }

    /// Removes all elements from the array and returns self for chaining.
    ///
    /// Prefer [`EphemeralArray::empty_at`] when the intent is to start with a fresh array.
    pub unconstrained fn clear(self) -> Self {
        ephemeral::clear_oracle(self.slot);
        self
    }

    /// Calls a function on each element of the array.
    ///
    /// The function `f` is called once with each array value and its corresponding index. Iteration proceeds
    /// backwards so that it is safe to remove the current element (and only the current element) inside the
    /// callback.
    ///
    /// It is **not** safe to push new elements from inside the callback.
    pub unconstrained fn for_each<Env>(self, f: unconstrained fn[Env](u32, T) -> ())
    where
        T: Deserialize,
    {
        let mut i = self.len();
        while i > 0 {
            i -= 1;
            f(i, self.get(i));
        }
    }

    /// Applies `f` to every element and collects the results into a fresh ephemeral array.
    ///
    /// Reads each element in order, transforms it with `f`, and pushes the result onto a new array at a freshly
    /// allocated slot (see [`EphemeralArray::empty`]). The source array is left unchanged, and the result is isolated
    /// from it, so `map` can be chained.
    pub unconstrained fn map<U, Env>(self, f: unconstrained fn[Env](T) -> U) -> EphemeralArray<U>
    where
        T: Deserialize,
        U: Serialize,
    {
        let dest: EphemeralArray<U> = EphemeralArray::empty();
        let n = self.len();
        for i in 0..n {
            dest.push(f(self.get(i)));
        }
        dest
    }

    /// Collects every element satisfying the predicate `f` into a fresh ephemeral array.
    ///
    /// Reads each element in order, keeps those for which `f` returns `true`, and pushes them onto a new array at a
    /// freshly allocated slot (see [`EphemeralArray::empty`]). Relative order is preserved. The source array is left
    /// unchanged, and the result is isolated from it, so `filter` can be chained.
    pub unconstrained fn filter<Env>(self, f: unconstrained fn[Env](T) -> bool) -> Self
    where
        T: Serialize + Deserialize,
    {
        let dest: Self = EphemeralArray::empty();
        let n = self.len();
        for i in 0..n {
            let value = self.get(i);
            if f(value) {
                dest.push(value);
            }
        }
        dest
    }

    /// Returns `true` if at least one element satisfies the predicate `f`.
    ///
    /// Matches the `any` combinator on Noir's [`array`](std::array), slice, and `BoundedVec` collections. Defined in
    /// terms of [`EphemeralArray::filter`]: it keeps the matching elements and checks whether any survived. This is
    /// not short-circuiting — every element is tested even after the first match.
    pub unconstrained fn any<Env>(self, f: unconstrained fn[Env](T) -> bool) -> bool
    where
        T: Serialize + Deserialize,
    {
        self.filter(f).len() != 0
    }
}

impl EphemeralArray<Field> {
    /// Deserializes the whole array into a `T`.
    ///
    /// Asserts the array holds exactly `<T as Deserialize>::N` fields, then reconstructs a `T` from them. This is the
    /// read-back counterpart to pushing a value's serialized fields onto the array, and is defined only on
    /// `EphemeralArray<Field>` because deserialization reconstructs a type from raw fields.
    pub unconstrained fn read_as<T>(self) -> T
    where
        T: Deserialize,
    {
        assert_eq(self.len(), <T as Deserialize>::N, "EphemeralArray length mismatch for read_as");
        let mut fields: [Field; <T as Deserialize>::N] = [0; <T as Deserialize>::N];
        for i in 0..<T as Deserialize>::N {
            fields[i] = self.get(i);
        }
        Deserialize::deserialize(fields)
    }
}

/// Serializes an `EphemeralArray` as its slot identifier, allowing oracle function signatures to use
/// `EphemeralArray<T>` instead of opaque `Field` slots.
impl<T> Serialize for EphemeralArray<T> {
    let N: u32 = 1;

    fn serialize(self) -> [Field; Self::N] {
        [self.slot]
    }

    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.slot);
    }
}

/// Deserializes a single Field into an `EphemeralArray` handle, treating the field value as the slot identifier.
/// This is the inverse of [`Serialize`].
impl<T> Deserialize for EphemeralArray<T> {
    let N: u32 = 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self { slot: fields[0] }
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self { slot: reader.read() }
    }
}

mod test {
    use crate::protocol::traits::Serialize;
    use crate::test::helpers::test_environment::TestEnvironment;
    use crate::test::mocks::MockStruct;
    use super::EphemeralArray;

    global SLOT: Field = 1230;
    global OTHER_SLOT: Field = 5670;

    #[test]
    unconstrained fn empty_array() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<Field> = EphemeralArray::at(SLOT);
            assert_eq(array.len(), 0);
        });
    }

    #[test(should_fail_with = "out of bounds")]
    unconstrained fn empty_array_read() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);
            let _: Field = array.get(0);
        });
    }

    #[test(should_fail_with = "is empty")]
    unconstrained fn empty_array_pop() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);
            let _: Field = array.pop();
        });
    }

    #[test]
    unconstrained fn array_push() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);
            array.push(5);

            assert_eq(array.len(), 1);
            assert_eq(array.get(0), 5);
        });
    }

    #[test(should_fail_with = "out of bounds")]
    unconstrained fn read_past_len() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);
            array.push(5);

            let _ = array.get(1);
        });
    }

    #[test]
    unconstrained fn array_pop() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);
            array.push(5);
            array.push(10);

            let popped: Field = array.pop();
            assert_eq(popped, 10);
            assert_eq(array.len(), 1);
            assert_eq(array.get(0), 5);
        });
    }

    #[test]
    unconstrained fn array_set() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);
            array.push(5);
            array.set(0, 99);
            assert_eq(array.get(0), 99);
        });
    }

    #[test]
    unconstrained fn array_remove_last() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);
            array.push(5);
            array.remove(0);
            assert_eq(array.len(), 0);
        });
    }

    #[test]
    unconstrained fn array_remove_some() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);

            array.push(7);
            array.push(8);
            array.push(9);

            assert_eq(array.len(), 3);

            array.remove(1);

            assert_eq(array.len(), 2);
            assert_eq(array.get(0), 7);
            assert_eq(array.get(1), 9);
        });
    }

    #[test]
    unconstrained fn array_remove_all() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);

            array.push(7);
            array.push(8);
            array.push(9);

            array.remove(1);
            array.remove(1);
            array.remove(0);

            assert_eq(array.len(), 0);
        });
    }

    #[test]
    unconstrained fn for_each_called_with_all_elements() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);

            array.push(4);
            array.push(5);
            array.push(6);

            let called_with = &mut BoundedVec::<(u32, Field), 3>::new();
            array.for_each(|index, value| { called_with.push((index, value)); });

            assert_eq(called_with.len(), 3);
            assert(called_with.any(|(index, value)| (index == 0) & (value == 4)));
            assert(called_with.any(|(index, value)| (index == 1) & (value == 5)));
            assert(called_with.any(|(index, value)| (index == 2) & (value == 6)));
        });
    }

    #[test]
    unconstrained fn for_each_remove_some() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);

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
        });
    }

    #[test]
    unconstrained fn for_each_remove_all() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = EphemeralArray::at(SLOT);

            array.push(4);
            array.push(5);
            array.push(6);

            array.for_each(|index, _| { array.remove(index); });

            assert_eq(array.len(), 0);
        });
    }

    #[test]
    unconstrained fn different_slots_are_isolated() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array_a = EphemeralArray::at(SLOT);
            let array_b = EphemeralArray::at(OTHER_SLOT);

            array_a.push(10);
            array_a.push(20);
            array_b.push(99);

            assert_eq(array_a.len(), 2);
            assert_eq(array_a.get(0), 10);
            assert_eq(array_a.get(1), 20);

            assert_eq(array_b.len(), 1);
            assert_eq(array_b.get(0), 99);
        });
    }

    #[test]
    unconstrained fn works_with_multi_field_type() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<MockStruct> = EphemeralArray::at(SLOT);

            let a = MockStruct::new(5, 6);
            let b = MockStruct::new(7, 8);
            array.push(a);
            array.push(b);

            assert_eq(array.len(), 2);
            assert_eq(array.get(0), a);
            assert_eq(array.get(1), b);

            let popped: MockStruct = array.pop();
            assert_eq(popped, b);
            assert_eq(array.len(), 1);
        });
    }

    #[test]
    unconstrained fn read_as_reconstructs_serialized_value() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);

            let value = MockStruct::new(5, 6);
            let serialized = value.serialize();
            for i in 0..serialized.len() {
                array.push(serialized[i]);
            }

            let reconstructed: MockStruct = array.read_as();
            assert_eq(reconstructed, value);
        });
    }

    #[test(should_fail_with = "length mismatch")]
    unconstrained fn read_as_rejects_length_mismatch() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            // MockStruct deserializes from 2 fields, so a single field is too short.
            array.push(1);

            let _: MockStruct = array.read_as();
        });
    }

    #[test]
    unconstrained fn empty_at_wipes_previous_data() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<Field> = EphemeralArray::at(SLOT);
            array.push(1);
            assert_eq(array.len(), 1);

            let fresh: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            assert_eq(fresh.len(), 0);
        });
    }

    #[test]
    unconstrained fn clear_returns_self() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<Field> = EphemeralArray::at(SLOT).clear();
            assert_eq(array.len(), 0);

            array.push(42);
            assert_eq(array.len(), 1);
            assert_eq(array.get(0), 42);
        });
    }

    #[test]
    unconstrained fn clear_wipes_previous_data() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<Field> = EphemeralArray::at(SLOT);
            array.push(1);
            array.push(2);
            array.push(3);
            assert_eq(array.len(), 3);

            // Clear the same slot, previous data should be gone.
            let fresh: EphemeralArray<Field> = EphemeralArray::at(SLOT).clear();
            assert_eq(fresh.len(), 0);
            fresh.push(4);
            assert_eq(fresh.get(0), 4);
        });
    }

    #[test]
    unconstrained fn empty_allocates_distinct_slots() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let a: EphemeralArray<Field> = EphemeralArray::empty();
            let b: EphemeralArray<Field> = EphemeralArray::empty();

            assert(a.slot != b.slot, "empty() should allocate a fresh slot each time");

            a.push(1);
            b.push(2);
            assert_eq(a.len(), 1);
            assert_eq(a.get(0), 1);
            assert_eq(b.len(), 1);
            assert_eq(b.get(0), 2);
        });
    }

    #[test]
    unconstrained fn map_transforms_each_element() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);

            let doubled: EphemeralArray<Field> = source.map(|x| x * 2);

            assert_eq(doubled.len(), 3);
            assert_eq(doubled.get(0), 2);
            assert_eq(doubled.get(1), 4);
            assert_eq(doubled.get(2), 6);

            // The source array is left untouched.
            assert_eq(source.len(), 3);
            assert_eq(source.get(0), 1);
        });
    }

    #[test]
    unconstrained fn map_empty_source_gives_empty_dest() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            let mapped: EphemeralArray<Field> = source.map(|x| x * 2);
            assert_eq(mapped.len(), 0);
        });
    }

    #[test]
    unconstrained fn map_to_different_type() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            source.push(5);
            source.push(7);

            let structs: EphemeralArray<MockStruct> = source.map(|x| MockStruct::new(x, x + 1));

            assert_eq(structs.len(), 2);
            assert_eq(structs.get(0), MockStruct::new(5, 6));
            assert_eq(structs.get(1), MockStruct::new(7, 8));
        });
    }

    #[test]
    unconstrained fn map_results_are_isolated() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);

            // Each map allocates its own fresh slot, so two maps of the same source do not clobber each other.
            let doubled: EphemeralArray<Field> = source.map(|x| x * 2);
            let tripled: EphemeralArray<Field> = source.map(|x| x * 3);

            assert(doubled.slot != tripled.slot, "each map should land in a distinct slot");
            assert_eq(doubled.get(0), 2);
            assert_eq(doubled.get(2), 6);
            assert_eq(tripled.get(0), 3);
            assert_eq(tripled.get(2), 9);
        });
    }

    #[test]
    unconstrained fn filter_keeps_matching_elements_in_order() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);
            source.push(2);
            source.push(5);

            let kept: EphemeralArray<Field> = source.filter(|x| x != 2);

            assert_eq(kept.len(), 3);
            assert_eq(kept.get(0), 1);
            assert_eq(kept.get(1), 3);
            assert_eq(kept.get(2), 5);

            // The source array is left untouched.
            assert_eq(source.len(), 5);
            assert_eq(source.get(1), 2);
        });
    }

    #[test]
    unconstrained fn filter_empty_source_gives_empty_dest() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            let kept: EphemeralArray<Field> = source.filter(|_| true);
            assert_eq(kept.len(), 0);
        });
    }

    #[test]
    unconstrained fn filter_none_match_gives_empty_dest() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);

            let kept: EphemeralArray<Field> = source.filter(|_| false);
            assert_eq(kept.len(), 0);
        });
    }

    #[test]
    unconstrained fn filter_works_with_multi_field_type() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: EphemeralArray<MockStruct> = EphemeralArray::empty_at(SLOT);
            source.push(MockStruct::new(1, 10));
            source.push(MockStruct::new(2, 20));
            source.push(MockStruct::new(3, 30));

            let kept: EphemeralArray<MockStruct> = source.filter(|s: MockStruct| s.a != 2);

            assert_eq(kept.len(), 2);
            assert_eq(kept.get(0), MockStruct::new(1, 10));
            assert_eq(kept.get(1), MockStruct::new(3, 30));
        });
    }

    #[test]
    unconstrained fn filter_results_are_isolated() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);
            source.push(4);

            // Each filter allocates its own fresh slot, so two filters of the same source do not clobber each other.
            let odds: EphemeralArray<Field> = source.filter(|x| (x != 2) & (x != 4));
            let evens: EphemeralArray<Field> = source.filter(|x| (x != 1) & (x != 3));

            assert(odds.slot != evens.slot, "each filter should land in a distinct slot");
            assert_eq(odds.len(), 2);
            assert_eq(odds.get(0), 1);
            assert_eq(odds.get(1), 3);
            assert_eq(evens.len(), 2);
            assert_eq(evens.get(0), 2);
            assert_eq(evens.get(1), 4);
        });
    }

    #[test]
    unconstrained fn any_is_true_when_an_element_matches() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            array.push(1);
            array.push(2);
            array.push(3);

            assert(array.any(|x| x == 2));
        });
    }

    #[test]
    unconstrained fn any_is_false_when_no_element_matches() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            array.push(1);
            array.push(2);
            array.push(3);

            assert(!array.any(|x| x == 9));
        });
    }

    #[test]
    unconstrained fn any_on_empty_array_is_false() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: EphemeralArray<Field> = EphemeralArray::empty_at(SLOT);
            assert(!array.any(|_| true));
        });
    }
}
