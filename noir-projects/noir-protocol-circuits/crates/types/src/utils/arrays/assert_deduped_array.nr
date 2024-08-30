use crate::{abis::side_effect::{Inner, Overridable}, traits::{Empty, is_empty}};

pub fn assert_deduped_array<S, T, let N: u32>(
    original_array: [S; N],
    deduped_array: [T; N]
) where S: Overridable + Inner<T>, T: Eq + Empty {
    let mut num_deduped = 0;
    for i in 0..original_array.len() {
        let original = original_array[i];
        if original.override_counter() == 0 {
            assert_eq(original.inner(), deduped_array[num_deduped], "mismatch deduped item");
            num_deduped += 1;
        } else {
            assert(
                is_empty(deduped_array[N - num_deduped]), "empty items must be padded to the deduped array"
            );
        }
    }
}

pub fn dedupe_array<S, T, let N: u32>(original_array: [S; N]) -> [T; N] where S: Overridable + Inner<T> {
    let mut deduped = BoundedVec::new();
    for i in 0..original_array.len() {
        let original = original_array[i];
        if original.override_counter() == 0 {
            deduped.push(original.inner());
        }
    }
    deduped.storage
}
