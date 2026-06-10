use crate::oracle::transient;
use crate::oracle_array::{ArrayOracle, OracleArray};
use crate::protocol::traits::{Deserialize, Serialize};

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
pub type TransientArray<T> = OracleArray<T, TransientOracle>;

/// Routes [`OracleArray`] operations to the transient array oracles, sharing arrays across all call frames of the
/// same contract within one top-level PXE call.
pub struct TransientOracle {}

impl ArrayOracle for TransientOracle {
    unconstrained fn len_oracle(slot: Field) -> u32 {
        transient::len_oracle(slot)
    }

    unconstrained fn push_oracle<let N: u32>(slot: Field, values: [Field; N]) -> u32 {
        transient::push_oracle(slot, values)
    }

    unconstrained fn pop_oracle<let N: u32>(slot: Field) -> [Field; N] {
        transient::pop_oracle(slot)
    }

    unconstrained fn get_oracle<let N: u32>(slot: Field, index: u32) -> [Field; N] {
        transient::get_oracle(slot, index)
    }

    unconstrained fn set_oracle<let N: u32>(slot: Field, index: u32, values: [Field; N]) {
        transient::set_oracle(slot, index, values)
    }

    unconstrained fn remove_oracle(slot: Field, index: u32) {
        transient::remove_oracle(slot, index)
    }

    unconstrained fn clear_oracle(slot: Field) {
        transient::clear_oracle(slot)
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
    use crate::protocol::traits::Serialize;
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
    unconstrained fn read_as_reconstructs_serialized_value() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: TransientArray<Field> = TransientArray::at(SLOT);

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
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            // MockStruct deserializes from 2 fields, so a single field is too short.
            array.push(1);

            let _: MockStruct = array.read_as();
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
    unconstrained fn empty_allocates_distinct_slots() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let a: TransientArray<Field> = TransientArray::empty();
            let b: TransientArray<Field> = TransientArray::empty();

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
            let source: TransientArray<Field> = TransientArray::at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);

            let doubled: TransientArray<Field> = source.map(|x| x * 2);

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
            let source: TransientArray<Field> = TransientArray::at(SLOT);
            let mapped: TransientArray<Field> = source.map(|x| x * 2);
            assert_eq(mapped.len(), 0);
        });
    }

    #[test]
    unconstrained fn map_to_different_type() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: TransientArray<Field> = TransientArray::at(SLOT);
            source.push(5);
            source.push(7);

            let structs: TransientArray<MockStruct> = source.map(|x| MockStruct::new(x, x + 1));

            assert_eq(structs.len(), 2);
            assert_eq(structs.get(0), MockStruct::new(5, 6));
            assert_eq(structs.get(1), MockStruct::new(7, 8));
        });
    }

    #[test]
    unconstrained fn map_results_are_isolated() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: TransientArray<Field> = TransientArray::at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);

            // Each map allocates its own fresh slot, so two maps of the same source do not clobber each other.
            let doubled: TransientArray<Field> = source.map(|x| x * 2);
            let tripled: TransientArray<Field> = source.map(|x| x * 3);

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
            let source: TransientArray<Field> = TransientArray::at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);
            source.push(2);
            source.push(5);

            let kept: TransientArray<Field> = source.filter(|x| x != 2);

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
            let source: TransientArray<Field> = TransientArray::at(SLOT);
            let kept: TransientArray<Field> = source.filter(|_| true);
            assert_eq(kept.len(), 0);
        });
    }

    #[test]
    unconstrained fn filter_none_match_gives_empty_dest() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: TransientArray<Field> = TransientArray::at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);

            let kept: TransientArray<Field> = source.filter(|_| false);
            assert_eq(kept.len(), 0);
        });
    }

    #[test]
    unconstrained fn filter_works_with_multi_field_type() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: TransientArray<MockStruct> = TransientArray::at(SLOT);
            source.push(MockStruct::new(1, 10));
            source.push(MockStruct::new(2, 20));
            source.push(MockStruct::new(3, 30));

            let kept: TransientArray<MockStruct> = source.filter(|s: MockStruct| s.a != 2);

            assert_eq(kept.len(), 2);
            assert_eq(kept.get(0), MockStruct::new(1, 10));
            assert_eq(kept.get(1), MockStruct::new(3, 30));
        });
    }

    #[test]
    unconstrained fn filter_results_are_isolated() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let source: TransientArray<Field> = TransientArray::at(SLOT);
            source.push(1);
            source.push(2);
            source.push(3);
            source.push(4);

            // Each filter allocates its own fresh slot, so two filters of the same source do not clobber each other.
            let odds: TransientArray<Field> = source.filter(|x| (x != 2) & (x != 4));
            let evens: TransientArray<Field> = source.filter(|x| (x != 1) & (x != 3));

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
            let array: TransientArray<Field> = TransientArray::at(SLOT);
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
            let array: TransientArray<Field> = TransientArray::at(SLOT);
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
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            assert(!array.any(|_| true));
        });
    }

    #[test]
    unconstrained fn all_is_true_when_every_element_matches() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            array.push(1);
            array.push(2);
            array.push(3);

            assert(array.all(|x| x != 0));
        });
    }

    #[test]
    unconstrained fn all_is_false_when_one_element_fails() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            array.push(1);
            array.push(2);
            array.push(3);

            assert(!array.all(|x| x != 2));
        });
    }

    #[test]
    unconstrained fn all_on_empty_array_is_true() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            assert(array.all(|_| false));
        });
    }

    #[test]
    unconstrained fn find_returns_first_matching_element() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            array.push(1);
            array.push(2);
            array.push(3);
            array.push(4);

            // Both 2 and 4 match; find must return the first one in order.
            let found = array.find(|x| (x == 2) | (x == 4));
            assert(found.is_some());
            assert_eq(found.unwrap(), 2);
        });
    }

    #[test]
    unconstrained fn find_returns_none_when_no_element_matches() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            array.push(1);
            array.push(2);
            array.push(3);

            assert(array.find(|x| x == 9).is_none());
        });
    }

    #[test]
    unconstrained fn find_on_empty_array_is_none() {
        let env = TestEnvironment::new();
        env.utility_context(|_| {
            let array: TransientArray<Field> = TransientArray::at(SLOT);
            assert(array.find(|_| true).is_none());
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
