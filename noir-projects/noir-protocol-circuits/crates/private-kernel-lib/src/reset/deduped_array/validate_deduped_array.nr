use types::utils::arrays::ClaimedLengthArray;

/// Validates that no original items are lost in the deduped array.
///
/// The prover provides `dedup_hints` mapping each original item to its position in the deduped array,
/// and `are_duplicates` defines what "duplicate" means for dedup purposes (e.g., ignoring counters for read requests).
///
/// This function enforces that each original item (within length) matches its hinted deduped item under are_duplicates,
/// ensuring no original requests are dropped.
///
/// The deduped array may contain extra items beyond what's in the original. This is acceptable because
/// the prover gains no advantage from injecting extra validation requests -- they would only need to
/// be processed in a subsequent reset circuit.
pub fn validate_deduped_array<T, let N: u32, Env>(
    original: ClaimedLengthArray<T, N>,
    deduped: ClaimedLengthArray<T, N>,
    dedup_hints: [u32; N],
    are_duplicates: fn[Env](T, T) -> bool,
) {
    // Each original item must match its hinted deduped item.
    original.for_each_i(|item, i| {
        let hint_index = dedup_hints[i];
        assert(hint_index < deduped.length, "Dedup hint index out of bounds");
        assert(
            are_duplicates(item, deduped.array[hint_index]),
            "Original item does not match hinted deduped item",
        );
    });
}

mod tests {
    use super::validate_deduped_array;
    use types::utils::arrays::ClaimedLengthArray;

    fn are_duplicate_fields(a: Field, b: Field) -> bool {
        a == b
    }

    // ==================== Success cases ====================

    #[test]
    fn all_unique_items() {
        let original = ClaimedLengthArray { array: [10, 20, 30, 0], length: 3 };
        let deduped = ClaimedLengthArray { array: [10, 20, 30, 0], length: 3 };
        let hints = [0, 1, 2, 0];
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    #[test]
    fn all_duplicates() {
        let original = ClaimedLengthArray { array: [10, 10, 10, 0], length: 3 };
        let deduped = ClaimedLengthArray { array: [10, 0, 0, 0], length: 1 };
        let hints = [0, 0, 0, 0];
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    #[test]
    fn mix_of_unique_and_duplicate() {
        let original = ClaimedLengthArray { array: [10, 20, 10, 20], length: 4 };
        let deduped = ClaimedLengthArray { array: [10, 20, 0, 0], length: 2 };
        let hints = [0, 1, 0, 1];
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    #[test]
    fn single_item() {
        let original = ClaimedLengthArray { array: [42, 0, 0, 0], length: 1 };
        let deduped = ClaimedLengthArray { array: [42, 0, 0, 0], length: 1 };
        let hints = [0, 0, 0, 0];
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    #[test]
    fn empty_arrays() {
        let original: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [0, 0, 0, 0], length: 0 };
        let deduped: ClaimedLengthArray<Field, 4> =
            ClaimedLengthArray { array: [0, 0, 0, 0], length: 0 };
        let hints = [0, 0, 0, 0];
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    #[test]
    fn deduped_order_differs() {
        // Deduped array can reorder items as long as hints are correct.
        let original = ClaimedLengthArray { array: [10, 20, 10, 20], length: 4 };
        let deduped = ClaimedLengthArray { array: [20, 10, 0, 0], length: 2 };
        let hints = [1, 0, 1, 0];
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    #[test]
    fn deduped_has_extra_items() {
        // The prover gains nothing from adding extra requests, so this is allowed.
        let original = ClaimedLengthArray { array: [10, 20, 0, 0], length: 2 };
        let deduped = ClaimedLengthArray { array: [10, 20, 30, 0], length: 3 };
        let hints = [0, 1, 0, 0];
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    #[test]
    fn unreferenced_deduped_item_allowed() {
        // Deduped[1] is not referenced by any original item. This is fine.
        let original = ClaimedLengthArray { array: [10, 10, 0, 0], length: 2 };
        let deduped = ClaimedLengthArray { array: [10, 99, 0, 0], length: 2 };
        let hints = [0, 0, 0, 0];
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    #[test]
    fn duplicate_in_deduped_allowed() {
        // Duplicates in the deduped array are allowed; the prover just does extra work.
        let original = ClaimedLengthArray { array: [10, 10, 0, 0], length: 2 };
        let deduped = ClaimedLengthArray { array: [10, 10, 0, 0], length: 2 };
        let hints = [0, 1, 0, 0];
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    // ==================== Failure cases ====================

    #[test(should_fail_with = "Dedup hint index out of bounds")]
    fn hint_out_of_bounds() {
        let original = ClaimedLengthArray { array: [10, 20, 0, 0], length: 2 };
        let deduped = ClaimedLengthArray { array: [10, 0, 0, 0], length: 1 };
        let hints = [0, 1, 0, 0]; // hint 1 is out of bounds (deduped.length == 1)
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }

    #[test(should_fail_with = "Original item does not match hinted deduped item")]
    fn mismatch_between_original_and_deduped() {
        let original = ClaimedLengthArray { array: [10, 20, 0, 0], length: 2 };
        let deduped = ClaimedLengthArray { array: [10, 99, 0, 0], length: 2 };
        let hints = [0, 1, 0, 0]; // original[1]=20 doesn't match deduped[1]=99
        validate_deduped_array(original, deduped, hints, are_duplicate_fields);
    }
}
