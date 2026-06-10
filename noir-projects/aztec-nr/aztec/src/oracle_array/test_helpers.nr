//! Shared test suite for [`OracleArray`] backends.
//!
//! Every `unconstrained` function in this module checks one behavior of the shared [`OracleArray`] API (or of the
//! generic `store` / `load` / `delete` helpers) and is generic over the [`ArrayOracle`] backend. Backend test modules
//! do not reference the checks one by one: annotating a module with `ephemeral_oracle_array_tests` /
//! `transient_oracle_array_tests` generates one `#[test]` per check with that backend's oracle swapped in, so a check
//! added here automatically runs against every backend. Checks that are expected to fail must be registered in
//! `should_fail_message`, which supplies the message for the generated `#[test(should_fail_with = ...)]` attribute.
//! Each backend module additionally keeps a hand-written smoke test routing through its own public helpers (e.g.
//! `transient::store` / `transient::load`) to cover the delegation wiring.

use crate::oracle_array::{ArrayOracle, delete, load, OracleArray, store};
use crate::protocol::traits::Serialize;
use crate::test::helpers::test_environment::TestEnvironment;
use crate::test::mocks::MockStruct;

pub(crate) global SLOT: Field = 1230;
pub(crate) global OTHER_SLOT: Field = 5670;

pub(crate) unconstrained fn empty_array<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        assert_eq(array.len(), 0);
    });
}

pub(crate) unconstrained fn empty_array_read<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        let _: Field = array.get(0);
    });
}

pub(crate) unconstrained fn empty_array_pop<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        let _: Field = array.pop();
    });
}

pub(crate) unconstrained fn array_push<Oracle>()
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

pub(crate) unconstrained fn read_past_len<Oracle>()
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

pub(crate) unconstrained fn array_pop<Oracle>()
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

pub(crate) unconstrained fn array_set<Oracle>()
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

pub(crate) unconstrained fn array_remove_last<Oracle>()
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

pub(crate) unconstrained fn array_remove_some<Oracle>()
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

pub(crate) unconstrained fn array_remove_all<Oracle>()
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

pub(crate) unconstrained fn for_each_called_with_all_elements<Oracle>()
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

pub(crate) unconstrained fn for_each_remove_some<Oracle>()
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

pub(crate) unconstrained fn for_each_remove_all<Oracle>()
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

pub(crate) unconstrained fn different_slots_are_isolated<Oracle>()
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

pub(crate) unconstrained fn works_with_multi_field_type<Oracle>()
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

pub(crate) unconstrained fn read_as_reconstructs_serialized_value<Oracle>()
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

pub(crate) unconstrained fn read_as_rejects_length_mismatch<Oracle>()
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

pub(crate) unconstrained fn clear_returns_self<Oracle>()
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

pub(crate) unconstrained fn clear_wipes_previous_data<Oracle>()
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

pub(crate) unconstrained fn empty_allocates_distinct_slots<Oracle>()
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

pub(crate) unconstrained fn map_transforms_each_element<Oracle>()
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

pub(crate) unconstrained fn map_empty_source_gives_empty_dest<Oracle>()
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

pub(crate) unconstrained fn map_to_different_type<Oracle>()
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

pub(crate) unconstrained fn map_results_are_isolated<Oracle>()
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

pub(crate) unconstrained fn filter_keeps_matching_elements_in_order<Oracle>()
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

pub(crate) unconstrained fn filter_empty_source_gives_empty_dest<Oracle>()
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

pub(crate) unconstrained fn filter_none_match_gives_empty_dest<Oracle>()
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

pub(crate) unconstrained fn filter_works_with_multi_field_type<Oracle>()
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

pub(crate) unconstrained fn filter_results_are_isolated<Oracle>()
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

pub(crate) unconstrained fn any_is_true_when_an_element_matches<Oracle>()
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

pub(crate) unconstrained fn any_is_false_when_no_element_matches<Oracle>()
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

pub(crate) unconstrained fn any_on_empty_array_is_false<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        assert(!array.any(|_| true));
    });
}

pub(crate) unconstrained fn all_is_true_when_every_element_matches<Oracle>()
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

pub(crate) unconstrained fn all_is_false_when_one_element_fails<Oracle>()
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

pub(crate) unconstrained fn all_on_empty_array_is_true<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        assert(array.all(|_| false));
    });
}

pub(crate) unconstrained fn find_returns_first_matching_element<Oracle>()
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

pub(crate) unconstrained fn find_returns_none_when_no_element_matches<Oracle>()
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

pub(crate) unconstrained fn find_on_empty_array_is_none<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        assert(array.find(|_| true).is_none());
    });
}

pub(crate) unconstrained fn empty_at_wipes_previous_data<Oracle>()
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

pub(crate) unconstrained fn load_empty_returns_none<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let value: Option<Field> = load::<Field, Oracle>(SLOT);
        assert_eq(value, Option::none());
    });
}

pub(crate) unconstrained fn store_overwrites<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        store::<Field, Oracle>(SLOT, 1);
        store::<Field, Oracle>(SLOT, 2);
        assert_eq(load::<Field, Oracle>(SLOT), Option::some(2));
    });
}

pub(crate) unconstrained fn delete_removes_value<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        store::<Field, Oracle>(SLOT, 42);
        delete::<Oracle>(SLOT);
        let value: Option<Field> = load::<Field, Oracle>(SLOT);
        assert_eq(value, Option::none());
    });
}

pub(crate) unconstrained fn delete_empty_is_noop<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        delete::<Oracle>(SLOT);
        let value: Option<Field> = load::<Field, Oracle>(SLOT);
        assert_eq(value, Option::none());
    });
}

pub(crate) unconstrained fn store_and_load_multi_field_type<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        let value = MockStruct::new(5, 6);
        store::<MockStruct, Oracle>(SLOT, value);
        assert_eq(load::<MockStruct, Oracle>(SLOT), Option::some(value));
    });
}

pub(crate) unconstrained fn stored_value_is_visible_as_a_length_one_array<Oracle>()
where
    Oracle: ArrayOracle,
{
    let env = TestEnvironment::new();
    env.utility_context(|_| {
        store::<Field, Oracle>(SLOT, 42);
        let array: OracleArray<Field, Oracle> = OracleArray::at(SLOT);
        assert_eq(array.len(), 1);
        assert_eq(array.get(0), 42);
    });
}

/// Returns the `should_fail_with` message for checks that are expected to fail, or `Option::none()` for checks that
/// are expected to pass.
comptime fn should_fail_message(name: Quoted) -> Option<Quoted> {
    if name == quote { empty_array_read } {
        Option::some(quote { "out of bounds" })
    } else if name == quote { empty_array_pop } {
        Option::some(quote { "is empty" })
    } else if name == quote { read_past_len } {
        Option::some(quote { "out of bounds" })
    } else if name == quote { read_as_rejects_length_mismatch } {
        Option::some(quote { "length mismatch" })
    } else {
        Option::none()
    }
}

comptime fn oracle_array_tests(oracle: Quoted) -> Quoted {
    let helpers = quote { crate::oracle_array::test_helpers }.as_module().unwrap();
    let mut tests = quote {};
    for f in helpers.functions() {
        if f.is_unconstrained() {
            let name = f.name();
            let fail = should_fail_message(name);
            let attr = if fail.is_some() {
                let msg = fail.unwrap();
                quote { #[test(should_fail_with = $msg)] }
            } else {
                quote { #[test] }
            };
            tests = quote {
                $tests
                $attr
                unconstrained fn $name() {
                    crate::oracle_array::test_helpers::$name::<$oracle>();
                }
            };
        }
    }
    tests
}

/// Generates the shared [`OracleArray`] test suite against the ephemeral backend. Apply to a test module.
pub(crate) comptime fn ephemeral_oracle_array_tests(_m: Module) -> Quoted {
    oracle_array_tests(quote { crate::ephemeral::EphemeralOracle })
}

/// Generates the shared [`OracleArray`] test suite against the transient backend. Apply to a test module.
pub(crate) comptime fn transient_oracle_array_tests(_m: Module) -> Quoted {
    oracle_array_tests(quote { crate::transient::TransientOracle })
}
