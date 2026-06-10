//! Shared test suite for [`OracleArray`] backends.
//!
//! Each check exercises one behavior of the shared [`OracleArray`] API and is generic over the [`ArrayOracle`]
//! backend, so the ephemeral and transient test suites instantiate the same checks against their respective oracles
//! via thin `#[test]` wrappers. Tests for backend-specific API (e.g. `empty_at` on ephemeral arrays, or `store` /
//! `load` on transient ones) live with the backend instead.

use crate::oracle_array::{ArrayOracle, OracleArray};
use crate::protocol::traits::Serialize;
use crate::test::helpers::test_environment::TestEnvironment;
use crate::test::mocks::MockStruct;

pub(crate) global SLOT: Field = 1230;
pub(crate) global OTHER_SLOT: Field = 5670;

pub(crate) unconstrained fn check_empty_array<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        assert_eq(array.len(), 0);
    });
}

pub(crate) unconstrained fn check_empty_array_read<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        let _: Field = array.get(0);
    });
}

pub(crate) unconstrained fn check_empty_array_pop<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        let _: Field = array.pop();
    });
}

pub(crate) unconstrained fn check_array_push<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(5);

        assert_eq(array.len(), 1);
        assert_eq(array.get(0), 5);
    });
}

pub(crate) unconstrained fn check_read_past_len<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(5);

        let _ = array.get(1);
    });
}

pub(crate) unconstrained fn check_array_pop<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(5);
        array.push(10);

        let popped: Field = array.pop();
        assert_eq(popped, 10);
        assert_eq(array.len(), 1);
        assert_eq(array.get(0), 5);
    });
}

pub(crate) unconstrained fn check_array_set<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(5);
        array.set(0, 99);
        assert_eq(array.get(0), 99);
    });
}

pub(crate) unconstrained fn check_array_remove_last<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(5);
        array.remove(0);
        assert_eq(array.len(), 0);
    });
}

pub(crate) unconstrained fn check_array_remove_some<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);

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

pub(crate) unconstrained fn check_array_remove_all<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);

        array.push(7);
        array.push(8);
        array.push(9);

        array.remove(1);
        array.remove(1);
        array.remove(0);

        assert_eq(array.len(), 0);
    });
}

pub(crate) unconstrained fn check_for_each_called_with_all_elements<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);

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

pub(crate) unconstrained fn check_for_each_remove_some<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);

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

pub(crate) unconstrained fn check_for_each_remove_all<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);

        array.push(4);
        array.push(5);
        array.push(6);

        array.for_each(|index, _| { array.remove(index); });

        assert_eq(array.len(), 0);
    });
}

pub(crate) unconstrained fn check_different_slots_are_isolated<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array_a: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        let array_b: OracleArray<Field, Oracle> = OracleArray::at(OTHER_SLOT);

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

pub(crate) unconstrained fn check_works_with_multi_field_type<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<MockStruct, Oracle> = OracleArray::at(SLOT);

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

pub(crate) unconstrained fn check_read_as_reconstructs_serialized_value<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);

        let value = MockStruct::new(5, 6);
        let serialized = value.serialize();
        for i in 0..serialized.len() {
            array.push(serialized[i]);
        }

        let reconstructed: MockStruct = array.read_as();
        assert_eq(reconstructed, value);
    });
}

pub(crate) unconstrained fn check_read_as_rejects_length_mismatch<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        // MockStruct deserializes from 2 fields, so a single field is too short.
        array.push(1);

        let _: MockStruct = array.read_as();
    });
}

pub(crate) unconstrained fn check_clear_returns_self<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT).clear();
        assert_eq(array.len(), 0);

        array.push(42);
        assert_eq(array.len(), 1);
        assert_eq(array.get(0), 42);
    });
}

pub(crate) unconstrained fn check_clear_wipes_previous_data<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);
        assert_eq(array.len(), 3);

        // Clear the same slot, previous data should be gone.
        let fresh: OracleArray<Field, Oracle> = OracleArray::at(SLOT).clear();
        assert_eq(fresh.len(), 0);
        fresh.push(4);
        assert_eq(fresh.get(0), 4);
    });
}

pub(crate) unconstrained fn check_empty_allocates_distinct_slots<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let a: OracleArray<Field, Oracle> = OracleArray::empty();
        let b: OracleArray<Field, Oracle> = OracleArray::empty();

        assert(a.slot != b.slot, "empty() should allocate a fresh slot each time");

        a.push(1);
        b.push(2);
        assert_eq(a.len(), 1);
        assert_eq(a.get(0), 1);
        assert_eq(b.len(), 1);
        assert_eq(b.get(0), 2);
    });
}

pub(crate) unconstrained fn check_map_transforms_each_element<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);

        let doubled: OracleArray<Field, Oracle> = source.map(|x| x * 2);

        assert_eq(doubled.len(), 3);
        assert_eq(doubled.get(0), 2);
        assert_eq(doubled.get(1), 4);
        assert_eq(doubled.get(2), 6);

        // The source array is left untouched.
        assert_eq(source.len(), 3);
        assert_eq(source.get(0), 1);
    });
}

pub(crate) unconstrained fn check_map_empty_source_gives_empty_dest<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        let mapped: OracleArray<Field, Oracle> = source.map(|x| x * 2);
        assert_eq(mapped.len(), 0);
    });
}

pub(crate) unconstrained fn check_map_to_different_type<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        source.push(5);
        source.push(7);

        let structs: OracleArray<MockStruct, Oracle> = source.map(|x| MockStruct::new(x, x + 1));

        assert_eq(structs.len(), 2);
        assert_eq(structs.get(0), MockStruct::new(5, 6));
        assert_eq(structs.get(1), MockStruct::new(7, 8));
    });
}

pub(crate) unconstrained fn check_map_results_are_isolated<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);

        // Each map allocates its own fresh slot, so two maps of the same source do not clobber each other.
        let doubled: OracleArray<Field, Oracle> = source.map(|x| x * 2);
        let tripled: OracleArray<Field, Oracle> = source.map(|x| x * 3);

        assert(doubled.slot != tripled.slot, "each map should land in a distinct slot");
        assert_eq(doubled.get(0), 2);
        assert_eq(doubled.get(2), 6);
        assert_eq(tripled.get(0), 3);
        assert_eq(tripled.get(2), 9);
    });
}

pub(crate) unconstrained fn check_filter_keeps_matching_elements_in_order<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);
        source.push(2);
        source.push(5);

        let kept: OracleArray<Field, Oracle> = source.filter(|x| x != 2);

        assert_eq(kept.len(), 3);
        assert_eq(kept.get(0), 1);
        assert_eq(kept.get(1), 3);
        assert_eq(kept.get(2), 5);

        // The source array is left untouched.
        assert_eq(source.len(), 5);
        assert_eq(source.get(1), 2);
    });
}

pub(crate) unconstrained fn check_filter_empty_source_gives_empty_dest<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        let kept: OracleArray<Field, Oracle> = source.filter(|_| true);
        assert_eq(kept.len(), 0);
    });
}

pub(crate) unconstrained fn check_filter_none_match_gives_empty_dest<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);

        let kept: OracleArray<Field, Oracle> = source.filter(|_| false);
        assert_eq(kept.len(), 0);
    });
}

pub(crate) unconstrained fn check_filter_works_with_multi_field_type<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: OracleArray<MockStruct, Oracle> = OracleArray::at(SLOT);
        source.push(MockStruct::new(1, 10));
        source.push(MockStruct::new(2, 20));
        source.push(MockStruct::new(3, 30));

        let kept: OracleArray<MockStruct, Oracle> = source.filter(|s: MockStruct| s.a != 2);

        assert_eq(kept.len(), 2);
        assert_eq(kept.get(0), MockStruct::new(1, 10));
        assert_eq(kept.get(1), MockStruct::new(3, 30));
    });
}

pub(crate) unconstrained fn check_filter_results_are_isolated<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);
        source.push(4);

        // Each filter allocates its own fresh slot, so two filters of the same source do not clobber each other.
        let odds: OracleArray<Field, Oracle> = source.filter(|x| (x != 2) & (x != 4));
        let evens: OracleArray<Field, Oracle> = source.filter(|x| (x != 1) & (x != 3));

        assert(odds.slot != evens.slot, "each filter should land in a distinct slot");
        assert_eq(odds.len(), 2);
        assert_eq(odds.get(0), 1);
        assert_eq(odds.get(1), 3);
        assert_eq(evens.len(), 2);
        assert_eq(evens.get(0), 2);
        assert_eq(evens.get(1), 4);
    });
}

pub(crate) unconstrained fn check_any_is_true_when_an_element_matches<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(array.any(|x| x == 2));
    });
}

pub(crate) unconstrained fn check_any_is_false_when_no_element_matches<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(!array.any(|x| x == 9));
    });
}

pub(crate) unconstrained fn check_any_on_empty_array_is_false<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        assert(!array.any(|_| true));
    });
}

pub(crate) unconstrained fn check_all_is_true_when_every_element_matches<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(array.all(|x| x != 0));
    });
}

pub(crate) unconstrained fn check_all_is_false_when_one_element_fails<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(!array.all(|x| x != 2));
    });
}

pub(crate) unconstrained fn check_all_on_empty_array_is_true<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        assert(array.all(|_| false));
    });
}

pub(crate) unconstrained fn check_find_returns_first_matching_element<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
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

pub(crate) unconstrained fn check_find_returns_none_when_no_element_matches<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(array.find(|x| x == 9).is_none());
    });
}

pub(crate) unconstrained fn check_find_on_empty_array_is_none<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        assert(array.find(|_| true).is_none());
    });
}

pub(crate) unconstrained fn check_empty_at_wipes_previous_data<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        array.push(1);
        assert_eq(array.len(), 1);

        let fresh: OracleArray<Field, Oracle> = OracleArray::empty_at(SLOT);
        assert_eq(fresh.len(), 0);
    });
}
