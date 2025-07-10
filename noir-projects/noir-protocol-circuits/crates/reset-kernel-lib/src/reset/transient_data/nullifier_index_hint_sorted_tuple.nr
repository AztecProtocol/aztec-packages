use crate::reset::transient_data::TransientDataIndexHint;
use types::utils::arrays::{get_sorted_tuple, SortedTuple};

pub unconstrained fn get_nullifier_index_hint_sorted_tuples<let NUM_INDEX_HINTS: u32>(
    transient_data_index_hints: [TransientDataIndexHint; NUM_INDEX_HINTS],
) -> [SortedTuple<u32>; NUM_INDEX_HINTS] {
    let nullifier_indices = transient_data_index_hints.map(|hint| hint.nullifier_index);
    get_sorted_tuple(nullifier_indices, |a, b| a < b)
}
