use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;
use dep::types::{
    abis::nullifier::ScopedNullifier,
    utils::arrays::{ClaimedLengthArray, find_first_index},
};

/// Returns the number of active hints in the `transient_data_squashing_hints` array.
/// Only the first `num_active_squashing_hints` entries in the array are used to squash (note hash, nullifier) pairs.
/// Remaining entries are considered inactive and will be ignored.
pub unconstrained fn get_num_active_squashing_hints<let SquashingHintsLen: u32, let NullifiersLen: u32>(
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    _nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
) -> u32 {
    find_first_index(
        transient_data_squashing_hints,
        |hint| hint.nullifier_index == NullifiersLen,
    )
}
