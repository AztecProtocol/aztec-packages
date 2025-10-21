use crate::{constants::TWO_POW_64, poseidon2::Poseidon2Sponge};

/// Computes, for a given sponge cache size, the number of items needed to reach cache size 1.
/// Fails if the sponge cache size is greater than the permutation size.
fn items_needed_for_cache_1<let PERMUTATION_SIZE: u32>(sponge_cache_size: u32) -> u32 {
    assert(
        sponge_cache_size <= PERMUTATION_SIZE,
        "Sponge cache size is greater than permutation size",
    );
    if sponge_cache_size == 0 {
        1
    } else if sponge_cache_size == 1 {
        0
    } else {
        (PERMUTATION_SIZE + 1) - sponge_cache_size
    }
}

/// Absorbs a number of items into a sponge from a larger array, one by one.
/// Fails if the number of items is greater than the maximum number of items
/// comptime defined.
fn absorb_items<let N: u32, let MAX_ITEMS: u32>(
    mut sponge: Poseidon2Sponge,
    input: [Field; N],
    offset: u32,
    num_items: u32,
) -> Poseidon2Sponge {
    let mut should_add = true;
    assert(num_items <= MAX_ITEMS, "num_items is greater than MAX_ITEMS");

    for i in 0..MAX_ITEMS {
        should_add &= i != num_items;
        if should_add {
            sponge.absorb(input[offset + i]);
        }
    }

    sponge
}

/// Absorbs a number of full permutations into a sponge from a larger array.
/// Assumes permutations that can ingest 3 items at a time.
/// Important: assumes that the sponge is in cache_size=1
/// In order to use this function with non-zero num_permutations, you must first align the sponge to cache_size=1 using `items_needed_for_cache_1`.
fn absorb_full_permutations<let NUM_ITEMS: u32, let MAX_PERMUTATIONS: u32>(
    mut sponge: Poseidon2Sponge,
    input: [Field; NUM_ITEMS],
    offset: u32,
    num_permutations: u32,
) -> Poseidon2Sponge {
    std::static_assert(sponge.cache.len() == 3, "Sponge cache must be 3 items");
    assert(
        num_permutations <= MAX_PERMUTATIONS,
        "num_permutations is greater than MAX_PERMUTATIONS",
    );
    if (num_permutations != 0) {
        assert(sponge.cache_size == 1, "Sponge must be in cache_size=1");
    }
    let mut should_add = true;

    for i in 0..MAX_PERMUTATIONS {
        should_add &= i != num_permutations;
        let chunk_base_index = offset + i * 3;
        if should_add {
            sponge.cache[1] = input[chunk_base_index];
            sponge.cache[2] = input[chunk_base_index + 1];
            // Add cache to state before permutation (duplex operation)
            for j in 0..3 {
                sponge.state[j] += sponge.cache[j];
            }
            sponge.state = std::hash::poseidon2_permutation(sponge.state, 4);
            sponge.cache[0] = input[chunk_base_index + 2];
        }
    }

    sponge
}

/// The below fn reduces gates of a conditional poseidon2 hash by approx 3x (thank you ~* Giant Brain Dev @IlyasRidhuan *~ for the idea)
/// Why? Because when we call stdlib poseidon, we call absorb for each item. When absorbing is conditional, it seems the compiler does not know
/// what cache_size will be when calling absorb, so it assigns the permutation gates for /each i/ rather than /every 3rd i/, which is actually required.
/// The below code forces the compiler to:
///  - absorb normally up to 2 times to set cache_size to 1
///  - absorb in chunks of 3 to ensure perm. only happens every 3rd absorb
///  - absorb normally up to 2 times to add any remaining values to the hash
/// In fixed len hashes, the compiler is able to tell that it will only need to perform the permutation every 3 absorbs.
fn absorb_in_chunks<let NUM_ITEMS: u32, let MAX_CHUNKS: u32>(
    mut sponge: Poseidon2Sponge,
    input: [Field; NUM_ITEMS],
    in_len: u32,
) -> Poseidon2Sponge {
    std::static_assert(
        MAX_CHUNKS * 3 <= NUM_ITEMS,
        "MAX_CHUNKS * 3 must be less than or equal to NUM_ITEMS",
    );
    std::static_assert(
        (MAX_CHUNKS + 1) * 3 > NUM_ITEMS,
        "MAX_CHUNKS + 1 * 3 must be greater than NUM_ITEMS",
    );

    // In order to absorb full permutations, we need cache_size to be 1
    let prefix_items_to_align = items_needed_for_cache_1::<3>(sponge.cache_size);

    // Absorb up to cache size 1
    let num_prefix_items = std::cmp::min(prefix_items_to_align, in_len);

    sponge = absorb_items::<NUM_ITEMS, 2>(sponge, input, 0, num_prefix_items);

    // Now cache size is 1, we can absorb full permutations
    let num_full_permutations = (in_len - num_prefix_items) / 3;

    sponge = absorb_full_permutations::<NUM_ITEMS, MAX_CHUNKS>(
        sponge,
        input,
        num_prefix_items,
        num_full_permutations,
    );

    // Now we need to absorb any remaining items that don't complete a permutation
    let num_suffix_items = in_len - num_prefix_items - num_full_permutations * 3;

    sponge = absorb_items::<NUM_ITEMS, 2>(
        sponge,
        input,
        num_prefix_items + num_full_permutations * 3,
        num_suffix_items,
    );

    sponge
}

fn assert_trailing_zeros<let N: u32>(input: [Field; N], in_len: u32) {
    let mut should_check = false;
    for i in 0..N {
        should_check |= i == in_len;
        if should_check {
            assert_eq(input[i], 0, "Found non-zero field after breakpoint");
        }
    }
}

pub fn poseidon2_absorb_in_chunks_existing_sponge<let NUM_ITEMS: u32>(
    mut sponge: Poseidon2Sponge,
    input: [Field; NUM_ITEMS],
    in_len: u32,
    skip_0_check: bool,
) -> Poseidon2Sponge {
    assert(in_len <= NUM_ITEMS, "Given in_len to absorb is larger than the input array len");
    assert(!sponge.squeeze_mode, "Cannot absorb in squeeze mode");

    if (!skip_0_check) {
        assert_trailing_zeros(input, in_len);
    }
    absorb_in_chunks::<NUM_ITEMS, (NUM_ITEMS - (NUM_ITEMS % 3)) / 3>(sponge, input, in_len)
}

pub fn poseidon2_absorb_in_chunks<let N: u32>(
    input: [Field; N],
    in_len: u32,
    skip_0_check: bool,
) -> Poseidon2Sponge {
    let iv: Field = (in_len as Field) * TWO_POW_64;
    poseidon2_absorb_in_chunks_existing_sponge(
        Poseidon2Sponge::new(iv),
        input,
        in_len,
        skip_0_check,
    )
}

mod tests {
    use crate::constants::TWO_POW_64;
    use crate::poseidon2::Poseidon2Sponge;
    use super::{
        absorb_full_permutations, absorb_items, items_needed_for_cache_1,
        poseidon2_absorb_in_chunks, poseidon2_absorb_in_chunks_existing_sponge,
    };

    #[test]
    fn test_items_needed_for_cache_1() {
        // Test various cache sizes and their alignment requirements
        assert(items_needed_for_cache_1::<3>(0) == 1, "Cache size 0 should need 1 item");
        assert(items_needed_for_cache_1::<3>(1) == 0, "Cache size 1 should need 0 items");
        assert(items_needed_for_cache_1::<3>(2) == 2, "Cache size 2 should need 2 items");
        assert(items_needed_for_cache_1::<3>(3) == 1, "Cache size 3 should need 1 item");
    }

    #[test(should_fail_with = "Sponge cache size is greater than permutation size")]
    fn test_items_needed_for_cache_1_exceeds_permutation_size() {
        let _ = items_needed_for_cache_1::<3>(4);
    }

    #[test]
    fn test_absorb_items_zero_items() {
        let input: [Field; 10] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let sponge = Poseidon2Sponge::new(0);

        let mut result = absorb_items::<10, 2>(sponge, input, 0, 0);

        // Should produce same output as original sponge with no absorption
        assert(result.squeeze() == Poseidon2Sponge::new(0).squeeze(), "No items absorbed");
    }

    #[test]
    fn test_absorb_items_multiple() {
        let input: [Field; 10] = [42, 43, 3, 4, 5, 6, 7, 8, 9, 10];
        let sponge = Poseidon2Sponge::new(0);

        let mut result = absorb_items::<10, 2>(sponge, input, 0, 2);

        // Verify by comparing with manual absorption
        let mut expected = Poseidon2Sponge::new(0);
        expected.absorb(42);
        expected.absorb(43);

        assert(result.squeeze() == expected.squeeze(), "Should absorb multiple items correctly");
    }

    #[test]
    fn test_absorb_items_with_offset() {
        let input: [Field; 10] = [1, 2, 42, 43, 5, 6, 7, 8, 9, 10];
        let sponge = Poseidon2Sponge::new(0);

        let mut result = absorb_items::<10, 2>(sponge, input, 2, 2);

        // Verify items at offset 2 were absorbed
        let mut expected = Poseidon2Sponge::new(0);
        expected.absorb(42);
        expected.absorb(43);

        assert(result.squeeze() == expected.squeeze(), "Should absorb items starting at offset");
    }

    #[test(should_fail_with = "num_items is greater than MAX_ITEMS")]
    fn test_absorb_items_exceeds_max_items() {
        let input: [Field; 10] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let sponge = Poseidon2Sponge::new(0);

        let _ = absorb_items::<10, 2>(sponge, input, 0, 3);
    }

    #[test]
    fn test_absorb_full_permutations() {
        let input: [Field; 12] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        let mut sponge = Poseidon2Sponge::new(0);
        // Set cache_size to 1 by absorbing one item
        sponge.absorb(100);

        let mut result = absorb_full_permutations::<12, 3>(sponge, input, 0, 2);

        // Verify by manually absorbing the same items
        let mut expected = Poseidon2Sponge::new(0);
        expected.absorb(100);
        for i in 0..6 {
            expected.absorb(input[i]);
        }

        assert(result.squeeze() == expected.squeeze(), "Should absorb full permutations correctly");
    }

    #[test]
    fn test_absorb_full_permutations_zero() {
        let input: [Field; 12] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        let mut sponge = Poseidon2Sponge::new(0);
        sponge.absorb(100);

        let mut result = absorb_full_permutations::<12, 3>(sponge, input, 0, 0);

        // Should be same as original sponge with no additional absorption
        let mut expected = Poseidon2Sponge::new(0);
        expected.absorb(100);

        assert(
            result.squeeze() == expected.squeeze(),
            "Zero permutations should not change sponge",
        );
    }

    #[test(should_fail_with = "Sponge must be in cache_size=1")]
    fn test_absorb_full_permutations_wrong_cache_size() {
        let input: [Field; 12] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        let sponge = Poseidon2Sponge::new(0); // cache_size is 0

        let _ = absorb_full_permutations::<12, 3>(sponge, input, 0, 1);
    }

    #[test(should_fail_with = "num_permutations is greater than MAX_PERMUTATIONS")]
    fn test_absorb_full_permutations_exceeds_max() {
        let input: [Field; 12] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        let mut sponge = Poseidon2Sponge::new(0);
        sponge.absorb(100);

        let _ = absorb_full_permutations::<12, 2>(sponge, input, 0, 3);
    }

    #[test]
    fn existing_sponge_poseidon_chunks_matches_fixed() {
        let in_len = 501;
        let mut input: [Field; 4096] = [0; 4096];
        let mut fixed_input = [3; 501];
        assert(in_len == fixed_input.len()); // sanity check
        for i in 0..in_len {
            input[i] = 3;
        }
        // absorb 250 of the 501 things
        let empty_sponge = Poseidon2Sponge::new((in_len as Field) * TWO_POW_64);
        let first_sponge =
            poseidon2_absorb_in_chunks_existing_sponge(empty_sponge, input, 250, true);
        // now absorb the final 251 (since they are all 3s, im being lazy and not making a new array)
        let mut final_sponge =
            poseidon2_absorb_in_chunks_existing_sponge(first_sponge, input, 251, true);
        let fixed_len_hash = Poseidon2Sponge::hash(fixed_input, fixed_input.len());
        assert(final_sponge.squeeze() == fixed_len_hash);
    }

    #[test]
    fn poseidon_chunks_empty_inputs() {
        let in_len = 0;
        let mut input: [Field; 4096] = [0; 4096];
        let mut constructed_empty_sponge = poseidon2_absorb_in_chunks(input, in_len, true);
        let mut first_sponge = poseidon2_absorb_in_chunks_existing_sponge(
            constructed_empty_sponge,
            input,
            in_len,
            true,
        );
        assert(first_sponge.squeeze() == constructed_empty_sponge.squeeze());
    }

    #[test]
    fn test_poseidon_chunks_various_lengths() {
        // Test multiple lengths to ensure correctness across different permutation boundaries
        let mut input: [Field; 20] = [0; 20];
        for i in 0..20 {
            input[i] = (i + 1) as Field;
        }

        // Test length 1
        let mut result = poseidon2_absorb_in_chunks(input, 1, true);
        assert(result.squeeze() == Poseidon2Sponge::hash([1], 1), "Length 1 failed");

        // Test length 3 (exactly one full permutation)
        let mut result = poseidon2_absorb_in_chunks(input, 3, true);
        assert(result.squeeze() == Poseidon2Sponge::hash([1, 2, 3], 3), "Length 3 failed");

        // Test length 7 (2 full permutations + 1)
        let mut result = poseidon2_absorb_in_chunks(input, 7, true);
        assert(
            result.squeeze() == Poseidon2Sponge::hash([1, 2, 3, 4, 5, 6, 7], 7),
            "Length 7 failed",
        );

        // Test length 10 (3 full permutations + 1)
        let mut result = poseidon2_absorb_in_chunks(input, 10, true);
        assert(
            result.squeeze() == Poseidon2Sponge::hash([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10),
            "Length 10 failed",
        );
    }

    #[test]
    fn test_poseidon_chunks_with_zero_check_passes() {
        let mut input: [Field; 10] = [0; 10];
        input[0] = 42;
        input[1] = 43;
        input[2] = 44;

        let mut result = poseidon2_absorb_in_chunks(input, 3, false);
        let expected = Poseidon2Sponge::hash([42, 43, 44], 3);

        assert(result.squeeze() == expected, "Zero check should pass with trailing zeros");
    }

    #[test]
    fn test_incremental_absorption_matches_all_at_once() {
        let mut input: [Field; 30] = [0; 30];
        for i in 0..15 {
            input[i] = (i + 100) as Field;
        }

        // Absorb all 15 at once
        let iv = (15 as Field) * TWO_POW_64;
        let mut all_at_once =
            poseidon2_absorb_in_chunks_existing_sponge(Poseidon2Sponge::new(iv), input, 15, true);

        // Absorb incrementally: 7 + 8
        let mut incremental =
            poseidon2_absorb_in_chunks_existing_sponge(Poseidon2Sponge::new(iv), input, 7, true);
        let mut remaining: [Field; 30] = [0; 30];
        for i in 0..8 {
            remaining[i] = input[7 + i];
        }
        incremental = poseidon2_absorb_in_chunks_existing_sponge(incremental, remaining, 8, true);

        let all_at_once_hash = all_at_once.squeeze();
        let incremental_hash = incremental.squeeze();
        assert(
            all_at_once_hash == incremental_hash,
            "Incremental absorption should match all-at-once",
        );

        // verify that both match using the standard poseidon2 hash
        let mut exact_input = [0; 15];
        for i in 0..15 {
            exact_input[i] = (i + 100) as Field;
        }
        let exact_hash = Poseidon2Sponge::hash(exact_input, 15);
        assert(all_at_once_hash == exact_hash, "Chunked should match standard poseidon2 hash");
    }

    #[test(should_fail_with = "Given in_len to absorb is larger than the input array len")]
    fn test_poseidon_chunks_length_exceeds_array() {
        let input: [Field; 5] = [1, 2, 3, 4, 5];
        let _ = poseidon2_absorb_in_chunks(input, 10, true);
    }

    #[test(should_fail_with = "Found non-zero field after breakpoint")]
    fn test_zero_check_fails_with_trailing_non_zero() {
        let mut input: [Field; 10] = [0; 10];
        input[0] = 1;
        input[1] = 2;
        input[7] = 999; // Non-zero after length

        let _ = poseidon2_absorb_in_chunks(input, 2, false);
    }

    #[test]
    fn test_large_absorption() {
        // Test a larger number to ensure the optimization works correctly
        let mut input: [Field; 100] = [0; 100];
        for i in 0..50 {
            input[i] = (i + 1) as Field;
        }

        let mut result = poseidon2_absorb_in_chunks(input, 50, true);

        // Verify against standard approach
        let mut expected_input = [0; 50];
        for i in 0..50 {
            expected_input[i] = (i + 1) as Field;
        }
        let expected = Poseidon2Sponge::hash(expected_input, 50);

        assert(result.squeeze() == expected, "Large absorption should work correctly");
    }

    #[test]
    fn fuzz_7_items(items: [Field; 7], mut in_len: u32) {
        in_len = std::cmp::min(in_len, 7);
        let iv: Field = (in_len as Field) * TWO_POW_64;
        let mut sponge = Poseidon2Sponge::new(iv);

        for i in 0..7 {
            if i < in_len {
                sponge.absorb(items[i]);
            }
        }
        let expected_result = sponge.squeeze();
        let chunked_result = poseidon2_absorb_in_chunks(items, in_len, true).squeeze();
        assert(chunked_result == expected_result, "Fuzz 7 items should match expected");
    }

    #[test]
    fn fuzz_30_items(items: [Field; 30], mut in_len: u32) {
        in_len = std::cmp::min(in_len, 30);
        let iv: Field = (in_len as Field) * TWO_POW_64;
        let mut sponge = Poseidon2Sponge::new(iv);

        for i in 0..30 {
            if i < in_len {
                sponge.absorb(items[i]);
            }
        }
        let expected_result = sponge.squeeze();
        let chunked_result = poseidon2_absorb_in_chunks(items, in_len, true).squeeze();
        assert(chunked_result == expected_result, "Fuzz 30 items should match expected");
    }

    #[test]
    fn fuzz_1024_items(items: [Field; 1024], mut in_len: u32) {
        in_len = std::cmp::min(in_len, 1024);
        let iv: Field = (in_len as Field) * TWO_POW_64;
        let mut sponge = Poseidon2Sponge::new(iv);

        for i in 0..1024 {
            if i < in_len {
                sponge.absorb(items[i]);
            }
        }
        let expected_result = sponge.squeeze();
        let chunked_result = poseidon2_absorb_in_chunks(items, in_len, true).squeeze();
        assert(chunked_result == expected_result, "Fuzz 1024 items should match expected");
    }

    #[test(should_fail_with = "Found non-zero field after breakpoint")]
    fn poseidon_chunks_zero_check_regression() {
        // Five items
        let mut input: [Field; 5] = [
            42,
            /* will be absorbed to reach cache_size = 1 */
            43,
            /* will be absorbed */
            0,
            /* will be checked for zero */
            0,
            /* will be checked for zero */
            1, /* will be checked for zero */
        ];
        // Just absorbing two items. it should fail the zero check
        let in_len = 2;

        assert(
            poseidon2_absorb_in_chunks(input, in_len, false).squeeze()
                == Poseidon2Sponge::hash([42, 43], 2),
        );
    }

    #[test(should_fail_with = "Cannot absorb in squeeze mode")]
    fn test_cannot_absorb_after_squeeze() {
        let input: [Field; 10] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let mut sponge = Poseidon2Sponge::new(0);

        // Absorb some data
        sponge.absorb(100);

        // Squeeze to enter squeeze mode
        let _ = sponge.squeeze();

        // Try to absorb more data using chunked function - should fail
        let _ = poseidon2_absorb_in_chunks_existing_sponge(sponge, input, 5, true);
    }

}
