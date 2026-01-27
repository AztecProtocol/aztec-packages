use crate::reset::transient_data::transient_data_squashing_hint::TransientDataSquashingHint;
use dep::types::{
    abis::nullifier::Nullifier,
    side_effect::{Counted, Scoped},
    utils::arrays::{ClaimedLengthArray, find_first_index},
};

/// Returns the number of active hints in the `transient_data_squashing_hints` array.
/// Only the first `num_active_squashing_hints` entries in the array are used to squash (note hash, nullifier) pairs.
/// Remaining entries are considered inactive and will be ignored.
// Q: what happens if there's a discrepancy where a hint.note_hash_index isn't nullish but the hint.nullifier_index is (or vice versa)?
// Should we throw an error that the transient_data_squashing_hints input is malformed?
// Q: what happens if the notes length is different from the nullifiers length? We're only checking against NullifiersLen and not NoteHashesLen; seems dangerous for future aztec devs.
// Q: what happens if there are more hints beyond the first nullish entry? Should we throw an error that the transient_data_squashing_hints input is malformed?
pub unconstrained fn get_num_active_squashing_hints<let SquashingHintsLen: u32, let NullifiersLen: u32>(
    transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    _nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, NullifiersLen>, // Can we call this fn with turbofish syntax instead, so we don't have this unused `nullifiers` param and all its dependencies?
) -> u32 {
    find_first_index(
        transient_data_squashing_hints,
        |hint| hint.nullifier_index == NullifiersLen, // TODO: would it be cleaner to use MAX_U32_VALUE instead of NullifiersLen? 
    )
}
