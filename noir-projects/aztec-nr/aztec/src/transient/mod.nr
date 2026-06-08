use crate::oracle::transient;
use crate::protocol::traits::{Deserialize, Serialize};
use crate::protocol::utils::{reader::Reader, writer::Writer};

/// A dynamically sized array that lives for the duration of a single top-level PXE call.
///
/// Like [`EphemeralArray`](crate::ephemeral::EphemeralArray), transient arrays are backed by in-memory storage on the
/// PXE side rather than a persistent database, and each logical operation is a single oracle call. The difference is
/// lifetime and visibility: a `TransientArray` is shared across **all call frames of the same contract (private and
/// utility alike)** within one top-level PXE call (transaction simulation or utility call), whereas an
/// `EphemeralArray` is confined to a single call frame.
///
/// In order of increasing lifetime: an [`EphemeralArray`](crate::ephemeral::EphemeralArray) lives for one call frame, a
/// `TransientArray` for one top-level PXE call, and a [`CapsuleArray`](crate::capsules::CapsuleArray) is persistent.
///
/// ## Privacy / Isolation
///
/// Arrays are keyed by `(executing contract address, slot)`. The contract address is supplied by PXE from the
/// executing context, so a contract can only ever access its own transient arrays; other contracts called within the
/// same top-level PXE call cannot see them, and this isolation holds across the private/utility boundary.
///
/// **Note on re-entrancy:** because visibility is flat within a contract, if the same contract is entered more than
/// once in a top-level PXE call (e.g. it calls back into itself, or a private frame calls one of its own functions),
/// those frames share the same arrays at the same slots. This differs from `EphemeralArray`, where even two frames of
/// the same contract are isolated.
///
/// ## Use Cases
///
/// Use this to pass not-to-be-persisted data between a contract's own frames (private or utility) within one top-level
/// PXE call. For data confined to a single call frame, prefer [`EphemeralArray`](crate::ephemeral::EphemeralArray).
/// For data that must persist indefinitely, use [`CapsuleArray`](crate::capsules::CapsuleArray).
pub struct TransientArray<T> {
    pub slot: Field,
}

impl<T> TransientArray<T> {
    /// Returns a handle to a transient array at the given slot, which may already contain data pushed by an earlier
    /// frame of the same contract in this top-level PXE call.
    pub unconstrained fn at(slot: Field) -> Self {
        Self { slot }
    }

    /// Returns the number of elements stored in the array.
    pub unconstrained fn len(self) -> u32 {
        transient::len_oracle(self.slot)
    }

    /// Stores a value at the end of the array.
    pub unconstrained fn push(self, value: T)
    where
        T: Serialize,
    {
        let serialized = value.serialize();
        let _ = transient::push_oracle(self.slot, serialized);
    }

    /// Removes and returns the last element. Panics if the array is empty.
    pub unconstrained fn pop(self) -> T
    where
        T: Deserialize,
    {
        let serialized = transient::pop_oracle(self.slot);
        Deserialize::deserialize(serialized)
    }

    /// Retrieves the value stored at `index`. Panics if the index is out of bounds.
    pub unconstrained fn get(self, index: u32) -> T
    where
        T: Deserialize,
    {
        let serialized = transient::get_oracle(self.slot, index);
        Deserialize::deserialize(serialized)
    }

    /// Overwrites the value stored at `index`. Panics if the index is out of bounds.
    pub unconstrained fn set(self, index: u32, value: T)
    where
        T: Serialize,
    {
        let serialized = value.serialize();
        transient::set_oracle(self.slot, index, serialized);
    }

    /// Removes the element at `index`, shifting subsequent elements backward. Panics if out of bounds.
    pub unconstrained fn remove(self, index: u32) {
        transient::remove_oracle(self.slot, index);
    }

    /// Removes all elements from the array and returns self for chaining (e.g. `TransientArray::at(slot).clear()`
    /// to get a guaranteed-empty array at a given slot).
    pub unconstrained fn clear(self) -> Self {
        transient::clear_oracle(self.slot);
        self
    }

    /// Calls a function on each element of the array.
    ///
    /// Iteration proceeds backwards so it is safe to remove the current element (and only the current element) inside
    /// the callback. It is **not** safe to push new elements from inside the callback.
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
}

/// Serializes a `TransientArray` as its slot identifier, allowing oracle function signatures to use `TransientArray<T>`
/// instead of opaque `Field` slots.
impl<T> Serialize for TransientArray<T> {
    let N: u32 = 1;

    fn serialize(self) -> [Field; Self::N] {
        [self.slot]
    }

    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.slot);
    }
}

/// Deserializes a single Field into a `TransientArray` handle, treating the field value as the slot identifier.
/// This is the inverse of [`Serialize`].
impl<T> Deserialize for TransientArray<T> {
    let N: u32 = 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self { slot: fields[0] }
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self { slot: reader.read() }
    }
}

/// Stores a single value at `slot`, overwriting any value previously stored there.
pub unconstrained fn store<T>(slot: Field, value: T)
where
    T: Serialize,
{
    let array: TransientArray<T> = TransientArray::at(slot);
    array.clear().push(value);
}

/// Returns the value previously stored at `slot` with [`store`], or `Option::none()` if the slot holds no value.
pub unconstrained fn load<T>(slot: Field) -> Option<T>
where
    T: Deserialize,
{
    let array: TransientArray<T> = TransientArray::at(slot);
    if array.len() == 0 {
        Option::none()
    } else {
        Option::some(array.get(0))
    }
}

/// Deletes the value stored at `slot`. Does nothing if the slot is already empty.
pub unconstrained fn delete(slot: Field) {
    transient::clear_oracle(slot);
}

mod test {
    use crate::test::helpers::test_environment::TestEnvironment;
    use crate::test::mocks::MockStruct;
    use super::{delete, load, store, TransientArray};

    global SLOT: Field = 1230;
    global OTHER_SLOT: Field = 5670;

    #[test]
    unconstrained fn empty_array() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            assert_eq(array.len(), 0);
        });
    }

    #[test(should_fail_with = "out of bounds")]
    unconstrained fn empty_array_read() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = TransientArray::at(SLOT);
            let _: Field = array.get(0);
        });
    }

    #[test(should_fail_with = "is empty")]
    unconstrained fn empty_array_pop() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = TransientArray::at(SLOT);
            let _: Field = array.pop();
        });
    }

    #[test]
    unconstrained fn array_push() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = TransientArray::at(SLOT);
            array.push(5);

            assert_eq(array.len(), 1);
            assert_eq(array.get(0), 5);
        });
    }

    #[test(should_fail_with = "out of bounds")]
    unconstrained fn read_past_len() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = TransientArray::at(SLOT);
            array.push(5);

            let _ = array.get(1);
        });
    }

    #[test]
    unconstrained fn set_and_remove() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = TransientArray::at(SLOT);
            array.push(7);
            array.push(8);
            array.push(9);
            array.set(0, 99);
            assert_eq(array.get(0), 99);
            array.remove(1);
            assert_eq(array.len(), 2);
            assert_eq(array.get(0), 99);
            assert_eq(array.get(1), 9);
        });
    }

    #[test]
    unconstrained fn array_pop() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = TransientArray::at(SLOT);
            array.push(5);
            array.push(10);

            let popped: Field = array.pop();
            assert_eq(popped, 10);
            assert_eq(array.len(), 1);
            assert_eq(array.get(0), 5);
        });
    }

    #[test]
    unconstrained fn array_remove_last() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = TransientArray::at(SLOT);
            array.push(5);
            array.remove(0);
            assert_eq(array.len(), 0);
        });
    }

    #[test]
    unconstrained fn array_remove_some() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array = TransientArray::at(SLOT);

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
            let array = TransientArray::at(SLOT);

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
            let array = TransientArray::at(SLOT);

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
            let array = TransientArray::at(SLOT);

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
            let array = TransientArray::at(SLOT);

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
            let array_a = TransientArray::at(SLOT);
            let array_b = TransientArray::at(OTHER_SLOT);

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
            let array: TransientArray<MockStruct> = TransientArray::at(SLOT);

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
    unconstrained fn clear_returns_self() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: TransientArray<Field> = TransientArray::at(SLOT).clear();
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
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            array.push(1);
            array.push(2);
            array.push(3);
            assert_eq(array.len(), 3);

            let fresh: TransientArray<Field> = TransientArray::at(SLOT).clear();
            assert_eq(fresh.len(), 0);
            fresh.push(4);
            assert_eq(fresh.get(0), 4);
        });
    }

    #[test]
    unconstrained fn store_and_load() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            store(SLOT, 42);
            assert_eq(load(SLOT), Option::some(42));
        });
    }

    #[test]
    unconstrained fn load_empty_returns_none() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let value: Option<Field> = load(SLOT);
            assert_eq(value, Option::none());
        });
    }

    #[test]
    unconstrained fn store_overwrites() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            store(SLOT, 1);
            store(SLOT, 2);
            assert_eq(load(SLOT), Option::some(2));
        });
    }

    #[test]
    unconstrained fn delete_removes_value() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            store(SLOT, 42);
            delete(SLOT);
            let value: Option<Field> = load(SLOT);
            assert_eq(value, Option::none());
        });
    }

    #[test]
    unconstrained fn delete_empty_is_noop() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            delete(SLOT);
            let value: Option<Field> = load(SLOT);
            assert_eq(value, Option::none());
        });
    }

    #[test]
    unconstrained fn store_and_load_multi_field_type() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let value = MockStruct::new(5, 6);
            store(SLOT, value);
            assert_eq(load(SLOT), Option::some(value));
        });
    }

    #[test]
    unconstrained fn stored_value_is_visible_as_a_length_one_array() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            store(SLOT, 42);
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            assert_eq(array.len(), 1);
            assert_eq(array.get(0), 42);
        });
    }
}
