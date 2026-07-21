//! Shared test suite for [`UnconstrainedArray`] backends.
//!
//! Every function in this module must be an unconstrained test helper, generic over the [`ArrayOracles`] backend.
//! The [`unconstrained_array_tests`](crate::unconstrained_array::test_suite::unconstrained_array_tests) macro turns
//! each helper into a `#[test]` for every backend.
//!
//! To add a test, write a new unconstrained helper here. If it is expected to fail, mark it with
//! [`should_fail_test`](crate::unconstrained_array::test_suite::should_fail_test) and the expected message; otherwise
//! the generated test expects it to pass.

use crate::test::helpers::test_environment::TestEnvironment;
use crate::test::mocks::MockStruct;
use crate::unconstrained_array::{ArrayOracles, UnconstrainedArray};

pub(crate) global SLOT: Field = 1230;
pub(crate) global OTHER_SLOT: Field = 5670;

pub(crate) unconstrained fn empty_array<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        assert_eq(array.len(), 0);
    });
}

#[crate::unconstrained_array::test_suite::should_fail_test(quote { "out of bounds" })]
pub(crate) unconstrained fn should_fail_empty_array_read<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        let _: Field = array.get(0);
    });
}

#[crate::unconstrained_array::test_suite::should_fail_test(quote { "is empty" })]
pub(crate) unconstrained fn should_fail_empty_array_pop<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        let _: Field = array.pop();
    });
}

pub(crate) unconstrained fn array_push<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(5);

        assert_eq(array.len(), 1);
        assert_eq(array.get(0), 5);
    });
}

#[crate::unconstrained_array::test_suite::should_fail_test(quote { "out of bounds" })]
pub(crate) unconstrained fn should_fail_read_past_len<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(5);

        let _ = array.get(1);
    });
}

pub(crate) unconstrained fn array_pop<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(5);
        array.push(10);

        let popped: Field = array.pop();
        assert_eq(popped, 10);
        assert_eq(array.len(), 1);
        assert_eq(array.get(0), 5);
    });
}

pub(crate) unconstrained fn array_set<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(5);
        array.set(0, 99);
        assert_eq(array.get(0), 99);
    });
}

pub(crate) unconstrained fn array_remove_last<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(5);
        array.remove(0);
        assert_eq(array.len(), 0);
    });
}

pub(crate) unconstrained fn array_remove_some<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);

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

pub(crate) unconstrained fn array_remove_all<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);

        array.push(7);
        array.push(8);
        array.push(9);

        array.remove(1);
        array.remove(1);
        array.remove(0);

        assert_eq(array.len(), 0);
    });
}

pub(crate) unconstrained fn for_each_called_with_all_elements_in_order<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);

        array.push(4);
        array.push(5);
        array.push(6);

        let called_with = &mut BoundedVec::<(u32, Field), 3>::new();
        array.for_each(|index, value| { called_with.push((index, value)); });

        assert_eq(called_with.len(), 3);
        assert_eq(called_with.get(0), (0, 4));
        assert_eq(called_with.get(1), (1, 5));
        assert_eq(called_with.get(2), (2, 6));
    });
}

pub(crate) unconstrained fn different_slots_are_isolated<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array_a: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        let array_b: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(OTHER_SLOT);

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

pub(crate) unconstrained fn works_with_multi_field_type<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<MockStruct, Oracle> = UnconstrainedArray::at(SLOT);

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

pub(crate) unconstrained fn clear_returns_self<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT).clear();
        assert_eq(array.len(), 0);

        array.push(42);
        assert_eq(array.len(), 1);
        assert_eq(array.get(0), 42);
    });
}

pub(crate) unconstrained fn clear_wipes_previous_data<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);
        assert_eq(array.len(), 3);

        // Clear the same slot, previous data should be gone.
        let fresh: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT).clear();
        assert_eq(fresh.len(), 0);
        fresh.push(4);
        assert_eq(fresh.get(0), 4);
    });
}

pub(crate) unconstrained fn empty_allocates_distinct_slots<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let a: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::empty();
        let b: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::empty();

        assert(a.slot != b.slot, "empty() should allocate a fresh slot each time");

        a.push(1);
        b.push(2);
        assert_eq(a.len(), 1);
        assert_eq(a.get(0), 1);
        assert_eq(b.len(), 1);
        assert_eq(b.get(0), 2);
    });
}

pub(crate) unconstrained fn map_transforms_each_element<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);

        let doubled: UnconstrainedArray<Field, Oracle> = source.map(|x| x * 2);

        assert_eq(doubled.len(), 3);
        assert_eq(doubled.get(0), 2);
        assert_eq(doubled.get(1), 4);
        assert_eq(doubled.get(2), 6);

        // The source array is left untouched.
        assert_eq(source.len(), 3);
        assert_eq(source.get(0), 1);
    });
}

pub(crate) unconstrained fn map_empty_source_gives_empty_dest<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        let mapped: UnconstrainedArray<Field, Oracle> = source.map(|x| x * 2);
        assert_eq(mapped.len(), 0);
    });
}

pub(crate) unconstrained fn map_to_different_type<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        source.push(5);
        source.push(7);

        let structs: UnconstrainedArray<MockStruct, Oracle> = source.map(|x| MockStruct::new(x, x + 1));

        assert_eq(structs.len(), 2);
        assert_eq(structs.get(0), MockStruct::new(5, 6));
        assert_eq(structs.get(1), MockStruct::new(7, 8));
    });
}

pub(crate) unconstrained fn map_results_are_isolated<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);

        // Each map allocates its own fresh slot, so two maps of the same source do not clobber each other.
        let doubled: UnconstrainedArray<Field, Oracle> = source.map(|x| x * 2);
        let tripled: UnconstrainedArray<Field, Oracle> = source.map(|x| x * 3);

        assert(doubled.slot != tripled.slot, "each map should land in a distinct slot");
        assert_eq(doubled.get(0), 2);
        assert_eq(doubled.get(2), 6);
        assert_eq(tripled.get(0), 3);
        assert_eq(tripled.get(2), 9);
    });
}

pub(crate) unconstrained fn filter_keeps_matching_elements_in_order<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);
        source.push(2);
        source.push(5);

        let kept: UnconstrainedArray<Field, Oracle> = source.filter(|x| x != 2);

        assert_eq(kept.len(), 3);
        assert_eq(kept.get(0), 1);
        assert_eq(kept.get(1), 3);
        assert_eq(kept.get(2), 5);

        // The source array is left untouched.
        assert_eq(source.len(), 5);
        assert_eq(source.get(1), 2);
    });
}

pub(crate) unconstrained fn filter_empty_source_gives_empty_dest<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        let kept: UnconstrainedArray<Field, Oracle> = source.filter(|_| true);
        assert_eq(kept.len(), 0);
    });
}

pub(crate) unconstrained fn filter_none_match_gives_empty_dest<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);

        let kept: UnconstrainedArray<Field, Oracle> = source.filter(|_| false);
        assert_eq(kept.len(), 0);
    });
}

pub(crate) unconstrained fn filter_works_with_multi_field_type<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: UnconstrainedArray<MockStruct, Oracle> = UnconstrainedArray::at(SLOT);
        source.push(MockStruct::new(1, 10));
        source.push(MockStruct::new(2, 20));
        source.push(MockStruct::new(3, 30));

        let kept: UnconstrainedArray<MockStruct, Oracle> = source.filter(|s: MockStruct| s.a != 2);

        assert_eq(kept.len(), 2);
        assert_eq(kept.get(0), MockStruct::new(1, 10));
        assert_eq(kept.get(1), MockStruct::new(3, 30));
    });
}

pub(crate) unconstrained fn filter_results_are_isolated<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let source: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        source.push(1);
        source.push(2);
        source.push(3);
        source.push(4);

        // Each filter allocates its own fresh slot, so two filters of the same source do not clobber each other.
        let odds: UnconstrainedArray<Field, Oracle> = source.filter(|x| (x != 2) & (x != 4));
        let evens: UnconstrainedArray<Field, Oracle> = source.filter(|x| (x != 1) & (x != 3));

        assert(odds.slot != evens.slot, "each filter should land in a distinct slot");
        assert_eq(odds.len(), 2);
        assert_eq(odds.get(0), 1);
        assert_eq(odds.get(1), 3);
        assert_eq(evens.len(), 2);
        assert_eq(evens.get(0), 2);
        assert_eq(evens.get(1), 4);
    });
}

pub(crate) unconstrained fn any_is_true_when_an_element_matches<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(array.any(|x| x == 2));
    });
}

pub(crate) unconstrained fn any_is_false_when_no_element_matches<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(!array.any(|x| x == 9));
    });
}

pub(crate) unconstrained fn any_on_empty_array_is_false<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        assert(!array.any(|_| true));
    });
}

pub(crate) unconstrained fn all_is_true_when_every_element_matches<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(array.all(|x| x != 0));
    });
}

pub(crate) unconstrained fn all_is_false_when_one_element_fails<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(!array.all(|x| x != 2));
    });
}

pub(crate) unconstrained fn all_on_empty_array_is_true<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        assert(array.all(|_| false));
    });
}

pub(crate) unconstrained fn find_returns_first_matching_element<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
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

pub(crate) unconstrained fn find_returns_none_when_no_element_matches<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(1);
        array.push(2);
        array.push(3);

        assert(array.find(|x| x == 9).is_none());
    });
}

pub(crate) unconstrained fn find_on_empty_array_is_none<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        assert(array.find(|_| true).is_none());
    });
}

pub(crate) unconstrained fn empty_at_wipes_previous_data<Oracle>()
where
    Oracle: ArrayOracles,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::at(SLOT);
        array.push(1);
        assert_eq(array.len(), 1);

        let fresh: UnconstrainedArray<Field, Oracle> = UnconstrainedArray::empty_at(SLOT);
        assert_eq(fresh.len(), 0);
    });
}
