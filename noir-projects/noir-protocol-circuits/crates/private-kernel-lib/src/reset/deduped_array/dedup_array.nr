use types::{traits::Empty, utils::arrays::ClaimedLengthArray};

/// Unconstrained function to generate a deduplicated array and index hints.
///
/// For each item in `original`, checks if an equal item (under `eq_fn`) already exists in the
/// deduped output. If so, records the existing index in `dedup_hints`. If not, appends the item
/// to the deduped output and records the new index.
///
/// Returns: (deduped_array, dedup_hints) where dedup_hints[i] is the index in deduped_array
/// that original[i] maps to.
pub unconstrained fn dedup_array<T, let N: u32, Env>(
    original: ClaimedLengthArray<T, N>,
    eq_fn: fn[Env](T, T) -> bool,
) -> (ClaimedLengthArray<T, N>, [u32; N])
where
    T: Empty,
{
    let mut deduped: ClaimedLengthArray<T, N> = ClaimedLengthArray::empty();
    let mut hints = [0 as u32; N];

    for i in 0..original.length {
        let item = original.array[i];

        // Search for an existing match in the deduped array.
        let mut found = false;
        let mut found_index = 0;
        for j in 0..deduped.length {
            if eq_fn(item, deduped.array[j]) {
                found = true;
                found_index = j;
                break;
            }
        }

        if found {
            hints[i] = found_index;
        } else {
            hints[i] = deduped.length;
            deduped.push(item);
        }
    }

    (deduped, hints)
}

mod tests {
    use super::dedup_array;
    use types::utils::arrays::ClaimedLengthArray;

    fn field_eq(a: Field, b: Field) -> bool {
        a == b
    }

    #[test]
    unconstrained fn all_unique() {
        let original = ClaimedLengthArray { array: [11, 22, 33, 0], length: 3 };
        let (deduped, hints) = dedup_array(original, field_eq);
        assert_eq(deduped.length, 3);
        assert_eq(deduped.array[0], 11);
        assert_eq(deduped.array[1], 22);
        assert_eq(deduped.array[2], 33);
        assert_eq(hints[0], 0);
        assert_eq(hints[1], 1);
        assert_eq(hints[2], 2);
    }

    #[test]
    unconstrained fn all_duplicates() {
        let original = ClaimedLengthArray { array: [11, 11, 11, 0], length: 3 };
        let (deduped, hints) = dedup_array(original, field_eq);
        assert_eq(deduped.length, 1);
        assert_eq(deduped.array[0], 11);
        assert_eq(hints[0], 0);
        assert_eq(hints[1], 0);
        assert_eq(hints[2], 0);
    }

    #[test]
    unconstrained fn mix_of_unique_and_duplicate() {
        let original = ClaimedLengthArray { array: [11, 22, 11, 33, 22, 0, 0], length: 5 };
        let (deduped, hints) = dedup_array(original, field_eq);
        assert_eq(deduped.length, 3);
        assert_eq(deduped.array[0], 11);
        assert_eq(deduped.array[1], 22);
        assert_eq(deduped.array[2], 33);
        assert_eq(hints[0], 0);
        assert_eq(hints[1], 1);
        assert_eq(hints[2], 0);
        assert_eq(hints[3], 2);
        assert_eq(hints[4], 1);
        assert_eq(hints[5], 0);
        assert_eq(hints[6], 0);
    }

    #[test]
    unconstrained fn empty_array() {
        let original = ClaimedLengthArray { array: [0, 0, 0, 0], length: 0 };
        let (deduped, _hints) = dedup_array(original, field_eq);
        assert_eq(deduped.length, 0);
    }

    #[test]
    unconstrained fn single_item() {
        let original = ClaimedLengthArray { array: [42, 0, 0, 0], length: 1 };
        let (deduped, hints) = dedup_array(original, field_eq);
        assert_eq(deduped.length, 1);
        assert_eq(deduped.array[0], 42);
        assert_eq(hints[0], 0);
    }
}
