use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;
use types::utils::arrays::{get_sorted_tuple, SortedTuple};

/// Constructs a sorted array of nullifier index tuples from the given squashing hints.
///
/// Each element in the returned array is a `SortedTuple`, containing the nullifier index from an active squashing hint
/// and its original position in the `transient_data_squashing_hints` array.
///
/// The array is sorted in ascending order by nullifier index.
pub unconstrained fn build_nullifier_index_sorted_tuples<let SquashingHintsLen: u32>(
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
) -> [SortedTuple<u32>; SquashingHintsLen] {
    let nullifier_indices = transient_data_squashing_hints.map(|hint| hint.nullifier_index);
    get_sorted_tuple(nullifier_indices, |a, b| a < b)
}
