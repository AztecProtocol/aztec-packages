use crate::{constants::TWO_POW_64, poseidon2::Poseidon2Sponge};
use std::{cmp::min, static_assert};

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

fn absorb_items<let NUM_ITEMS: u32>(
    mut sponge: Poseidon2Sponge,
    input: [Field; NUM_ITEMS],
    offset: u32,
    num_items: u32,
) -> Poseidon2Sponge {
    let mut should_add = true;

    for i in 0..3 {
        should_add &= i != num_items;
        if should_add {
            sponge.absorb(input[offset + i]);
        }
    }

    sponge
}

fn absorb_full_permutations<let NUM_ITEMS: u32, let MAX_PERMUTATIONS: u32>(
    mut sponge: Poseidon2Sponge,
    input: [Field; NUM_ITEMS],
    offset: u32,
    num_permutations: u32,
) -> Poseidon2Sponge {
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

// The below fn reduces gates of a conditional poseidon2 hash by approx 3x (thank you ~* Giant Brain Dev @IlyasRidhuan *~ for the idea)
// Why? Because when we call stdlib poseidon, we call absorb for each item. When absorbing is conditional, it seems the compiler does not know
// what cache_size will be when calling absorb, so it assigns the permutation gates for /each i/ rather than /every 3rd i/, which is actually required.
// The below code forces the compiler to:
//  - absorb normally up to 2 times to set cache_size to 1
//  - absorb in chunks of 3 to ensure perm. only happens every 3rd absorb
//  - absorb normally up to 2 times to add any remaining values to the hash
// In fixed len hashes, the compiler is able to tell that it will only need to perform the permutation every 3 absorbs.
// NB: it also replaces unnecessary range checks (i < thing) with a bit check (&= i != thing), which alone reduces the gates of a var. hash by half.
#[no_predicates]
fn absorb_in_chunks<let NUM_ITEMS: u32, let MAX_CHUNKS: u32>(
    mut sponge: Poseidon2Sponge,
    input: [Field; NUM_ITEMS],
    in_len: u32,
) -> Poseidon2Sponge {
    static_assert(
        MAX_CHUNKS * 3 <= NUM_ITEMS,
        "MAX_CHUNKS * 3 must be less than or equal to NUM_ITEMS",
    );
    static_assert(
        (MAX_CHUNKS + 1) * 3 > NUM_ITEMS,
        "MAX_CHUNKS + 1 * 3 must be greater than NUM_ITEMS",
    );

    // In order to absorb full permutations, we need cache_size to be 1
    let prefix_items_to_align = items_needed_for_cache_1::<3>(sponge.cache_size);

    // Absorb up to cache size 1
    let num_prefix_items = min(prefix_items_to_align, in_len);

    sponge = absorb_items(sponge, input, 0, num_prefix_items);

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

    sponge = absorb_items(
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

#[no_predicates]
pub fn poseidon2_absorb_chunks_existing_sponge<let NUM_ITEMS: u32>(
    mut sponge: Poseidon2Sponge,
    input: [Field; NUM_ITEMS],
    in_len: u32,
    skip_0_check: bool,
) -> Poseidon2Sponge {
    assert(in_len <= NUM_ITEMS, "Given in_len to absorb is larger than the input array len");

    if (!skip_0_check) {
        assert_trailing_zeros(input, in_len);
    }
    absorb_in_chunks::<NUM_ITEMS, (NUM_ITEMS - (NUM_ITEMS % 3)) / 3>(sponge, input, in_len)
}

#[no_predicates]
pub fn poseidon2_absorb_in_chunks<let N: u32>(
    input: [Field; N],
    in_len: u32,
    skip_0_check: bool,
) -> Poseidon2Sponge {
    let iv: Field = (in_len as Field) * TWO_POW_64;
    poseidon2_absorb_chunks_existing_sponge(Poseidon2Sponge::new(iv), input, in_len, skip_0_check)
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
    let first_sponge = poseidon2_absorb_chunks_existing_sponge(empty_sponge, input, 250, true);
    // now absorb the final 251 (since they are all 3s, im being lazy and not making a new array)
    let mut final_sponge = poseidon2_absorb_chunks_existing_sponge(first_sponge, input, 251, true);
    let fixed_len_hash = Poseidon2Sponge::hash(fixed_input, fixed_input.len());
    assert(final_sponge.squeeze() == fixed_len_hash);
}

#[test]
fn poseidon_chunks_empty_inputs() {
    let in_len = 0;
    let mut input: [Field; 4096] = [0; 4096];
    let mut constructed_empty_sponge = poseidon2_absorb_in_chunks(input, in_len, true);
    let mut first_sponge =
        poseidon2_absorb_chunks_existing_sponge(constructed_empty_sponge, input, in_len, true);
    assert(first_sponge.squeeze() == constructed_empty_sponge.squeeze());
}

#[test(should_fail)]
fn poseidon_chunks_zero_check_fails() {
    // Five non zero items
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
            == poseidon::poseidon2::Poseidon2::hash([42, 43], 2),
    );
}
