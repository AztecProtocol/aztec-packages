use crate::oracle::ephemeral;
use crate::oracle_array::{ArrayOracle, OracleArray};

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
pub type EphemeralArray<T> = OracleArray<T, EphemeralOracle>;

/// Routes [`OracleArray`] operations to the ephemeral array oracles, scoping arrays to a single contract call frame.
pub struct EphemeralOracle {}

impl ArrayOracle for EphemeralOracle {
    unconstrained fn len_oracle(slot: Field) -> u32 {
        ephemeral::len_oracle(slot)
    }

    unconstrained fn push_oracle<let N: u32>(slot: Field, values: [Field; N]) -> u32 {
        ephemeral::push_oracle(slot, values)
    }

    unconstrained fn pop_oracle<let N: u32>(slot: Field) -> [Field; N] {
        ephemeral::pop_oracle(slot)
    }

    unconstrained fn get_oracle<let N: u32>(slot: Field, index: u32) -> [Field; N] {
        ephemeral::get_oracle(slot, index)
    }

    unconstrained fn set_oracle<let N: u32>(slot: Field, index: u32, values: [Field; N]) {
        ephemeral::set_oracle(slot, index, values)
    }

    unconstrained fn remove_oracle(slot: Field, index: u32) {
        ephemeral::remove_oracle(slot, index)
    }

    unconstrained fn clear_oracle(slot: Field) {
        ephemeral::clear_oracle(slot)
    }
}

impl<T> OracleArray<T, EphemeralOracle> {
    /// Returns an empty ephemeral array at the given slot, clearing any pre-existing data.
    ///
    /// This is deliberately ephemeral-only: a [`TransientArray`](crate::transient::TransientArray) slot may hold data
    /// written by another frame of the same contract, so wiping a known slot there stays explicit via
    /// `TransientArray::at(slot).clear()`.
    pub unconstrained fn empty_at(slot: Field) -> Self {
        Self::at(slot).clear()
    }
}

mod test {
    use crate::oracle_array::test_helpers::SLOT;
    use crate::oracle_array::test_helpers as checks;
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{EphemeralArray, EphemeralOracle};

    #[test]
    unconstrained fn empty_array() {
        checks::check_empty_array::<EphemeralOracle>();
    }

    #[test(should_fail_with = "out of bounds")]
    unconstrained fn empty_array_read() {
        checks::check_empty_array_read::<EphemeralOracle>();
    }

    #[test(should_fail_with = "is empty")]
    unconstrained fn empty_array_pop() {
        checks::check_empty_array_pop::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn array_push() {
        checks::check_array_push::<EphemeralOracle>();
    }

    #[test(should_fail_with = "out of bounds")]
    unconstrained fn read_past_len() {
        checks::check_read_past_len::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn array_pop() {
        checks::check_array_pop::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn array_set() {
        checks::check_array_set::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn array_remove_last() {
        checks::check_array_remove_last::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn array_remove_some() {
        checks::check_array_remove_some::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn array_remove_all() {
        checks::check_array_remove_all::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn for_each_called_with_all_elements() {
        checks::check_for_each_called_with_all_elements::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn for_each_remove_some() {
        checks::check_for_each_remove_some::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn for_each_remove_all() {
        checks::check_for_each_remove_all::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn different_slots_are_isolated() {
        checks::check_different_slots_are_isolated::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn works_with_multi_field_type() {
        checks::check_works_with_multi_field_type::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn read_as_reconstructs_serialized_value() {
        checks::check_read_as_reconstructs_serialized_value::<EphemeralOracle>();
    }

    #[test(should_fail_with = "length mismatch")]
    unconstrained fn read_as_rejects_length_mismatch() {
        checks::check_read_as_rejects_length_mismatch::<EphemeralOracle>();
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
        checks::check_clear_returns_self::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn clear_wipes_previous_data() {
        checks::check_clear_wipes_previous_data::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn empty_allocates_distinct_slots() {
        checks::check_empty_allocates_distinct_slots::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn map_transforms_each_element() {
        checks::check_map_transforms_each_element::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn map_empty_source_gives_empty_dest() {
        checks::check_map_empty_source_gives_empty_dest::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn map_to_different_type() {
        checks::check_map_to_different_type::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn map_results_are_isolated() {
        checks::check_map_results_are_isolated::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn filter_keeps_matching_elements_in_order() {
        checks::check_filter_keeps_matching_elements_in_order::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn filter_empty_source_gives_empty_dest() {
        checks::check_filter_empty_source_gives_empty_dest::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn filter_none_match_gives_empty_dest() {
        checks::check_filter_none_match_gives_empty_dest::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn filter_works_with_multi_field_type() {
        checks::check_filter_works_with_multi_field_type::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn filter_results_are_isolated() {
        checks::check_filter_results_are_isolated::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn any_is_true_when_an_element_matches() {
        checks::check_any_is_true_when_an_element_matches::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn any_is_false_when_no_element_matches() {
        checks::check_any_is_false_when_no_element_matches::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn any_on_empty_array_is_false() {
        checks::check_any_on_empty_array_is_false::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn all_is_true_when_every_element_matches() {
        checks::check_all_is_true_when_every_element_matches::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn all_is_false_when_one_element_fails() {
        checks::check_all_is_false_when_one_element_fails::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn all_on_empty_array_is_true() {
        checks::check_all_on_empty_array_is_true::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn find_returns_first_matching_element() {
        checks::check_find_returns_first_matching_element::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn find_returns_none_when_no_element_matches() {
        checks::check_find_returns_none_when_no_element_matches::<EphemeralOracle>();
    }

    #[test]
    unconstrained fn find_on_empty_array_is_none() {
        checks::check_find_on_empty_array_is_none::<EphemeralOracle>();
    }
}
