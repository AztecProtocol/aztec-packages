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
    use crate::oracle_array::test_helpers::SLOT;
    use crate::oracle_array::test_helpers as checks;
    use crate::test::helpers::test_environment::TestEnvironment;
    use crate::test::mocks::MockStruct;
    use super::{delete, load, store, TransientArray, TransientOracle};

    #[test]
    unconstrained fn empty_array() {
        checks::check_empty_array::<TransientOracle>();
    }

    #[test(should_fail_with = "out of bounds")]
    unconstrained fn empty_array_read() {
        checks::check_empty_array_read::<TransientOracle>();
    }

    #[test(should_fail_with = "is empty")]
    unconstrained fn empty_array_pop() {
        checks::check_empty_array_pop::<TransientOracle>();
    }

    #[test]
    unconstrained fn array_push() {
        checks::check_array_push::<TransientOracle>();
    }

    #[test(should_fail_with = "out of bounds")]
    unconstrained fn read_past_len() {
        checks::check_read_past_len::<TransientOracle>();
    }

    #[test]
    unconstrained fn array_pop() {
        checks::check_array_pop::<TransientOracle>();
    }

    #[test]
    unconstrained fn array_set() {
        checks::check_array_set::<TransientOracle>();
    }

    #[test]
    unconstrained fn array_remove_last() {
        checks::check_array_remove_last::<TransientOracle>();
    }

    #[test]
    unconstrained fn array_remove_some() {
        checks::check_array_remove_some::<TransientOracle>();
    }

    #[test]
    unconstrained fn array_remove_all() {
        checks::check_array_remove_all::<TransientOracle>();
    }

    #[test]
    unconstrained fn for_each_called_with_all_elements() {
        checks::check_for_each_called_with_all_elements::<TransientOracle>();
    }

    #[test]
    unconstrained fn for_each_remove_some() {
        checks::check_for_each_remove_some::<TransientOracle>();
    }

    #[test]
    unconstrained fn for_each_remove_all() {
        checks::check_for_each_remove_all::<TransientOracle>();
    }

    #[test]
    unconstrained fn different_slots_are_isolated() {
        checks::check_different_slots_are_isolated::<TransientOracle>();
    }

    #[test]
    unconstrained fn works_with_multi_field_type() {
        checks::check_works_with_multi_field_type::<TransientOracle>();
    }

    #[test]
    unconstrained fn read_as_reconstructs_serialized_value() {
        checks::check_read_as_reconstructs_serialized_value::<TransientOracle>();
    }

    #[test(should_fail_with = "length mismatch")]
    unconstrained fn read_as_rejects_length_mismatch() {
        checks::check_read_as_rejects_length_mismatch::<TransientOracle>();
    }

    #[test]
    unconstrained fn clear_returns_self() {
        checks::check_clear_returns_self::<TransientOracle>();
    }

    #[test]
    unconstrained fn clear_wipes_previous_data() {
        checks::check_clear_wipes_previous_data::<TransientOracle>();
    }

    #[test]
    unconstrained fn empty_allocates_distinct_slots() {
        checks::check_empty_allocates_distinct_slots::<TransientOracle>();
    }

    #[test]
    unconstrained fn map_transforms_each_element() {
        checks::check_map_transforms_each_element::<TransientOracle>();
    }

    #[test]
    unconstrained fn map_empty_source_gives_empty_dest() {
        checks::check_map_empty_source_gives_empty_dest::<TransientOracle>();
    }

    #[test]
    unconstrained fn map_to_different_type() {
        checks::check_map_to_different_type::<TransientOracle>();
    }

    #[test]
    unconstrained fn map_results_are_isolated() {
        checks::check_map_results_are_isolated::<TransientOracle>();
    }

    #[test]
    unconstrained fn filter_keeps_matching_elements_in_order() {
        checks::check_filter_keeps_matching_elements_in_order::<TransientOracle>();
    }

    #[test]
    unconstrained fn filter_empty_source_gives_empty_dest() {
        checks::check_filter_empty_source_gives_empty_dest::<TransientOracle>();
    }

    #[test]
    unconstrained fn filter_none_match_gives_empty_dest() {
        checks::check_filter_none_match_gives_empty_dest::<TransientOracle>();
    }

    #[test]
    unconstrained fn filter_works_with_multi_field_type() {
        checks::check_filter_works_with_multi_field_type::<TransientOracle>();
    }

    #[test]
    unconstrained fn filter_results_are_isolated() {
        checks::check_filter_results_are_isolated::<TransientOracle>();
    }

    #[test]
    unconstrained fn any_is_true_when_an_element_matches() {
        checks::check_any_is_true_when_an_element_matches::<TransientOracle>();
    }

    #[test]
    unconstrained fn any_is_false_when_no_element_matches() {
        checks::check_any_is_false_when_no_element_matches::<TransientOracle>();
    }

    #[test]
    unconstrained fn any_on_empty_array_is_false() {
        checks::check_any_on_empty_array_is_false::<TransientOracle>();
    }

    #[test]
    unconstrained fn all_is_true_when_every_element_matches() {
        checks::check_all_is_true_when_every_element_matches::<TransientOracle>();
    }

    #[test]
    unconstrained fn all_is_false_when_one_element_fails() {
        checks::check_all_is_false_when_one_element_fails::<TransientOracle>();
    }

    #[test]
    unconstrained fn all_on_empty_array_is_true() {
        checks::check_all_on_empty_array_is_true::<TransientOracle>();
    }

    #[test]
    unconstrained fn find_returns_first_matching_element() {
        checks::check_find_returns_first_matching_element::<TransientOracle>();
    }

    #[test]
    unconstrained fn find_returns_none_when_no_element_matches() {
        checks::check_find_returns_none_when_no_element_matches::<TransientOracle>();
    }

    #[test]
    unconstrained fn find_on_empty_array_is_none() {
        checks::check_find_on_empty_array_is_none::<TransientOracle>();
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
