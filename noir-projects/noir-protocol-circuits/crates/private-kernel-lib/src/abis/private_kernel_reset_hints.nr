use crate::reset::{KeyValidationHint, ReadRequestHints, TransientDataSquashingHint};
use types::{
    abis::{
        note_hash_leaf_preimage::NoteHashLeafPreimage,
        nullifier_leaf_preimage::NullifierLeafPreimage,
    },
    constants::{
        MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        NOTE_HASH_TREE_HEIGHT, NULLIFIER_TREE_HEIGHT,
    },
};

pub type NoteHashReadRequestHints<let PendingReadHintsLen: u32, let SettledReadHintsLen: u32> = ReadRequestHints<MAX_NOTE_HASH_READ_REQUESTS_PER_TX, PendingReadHintsLen, SettledReadHintsLen, NOTE_HASH_TREE_HEIGHT, NoteHashLeafPreimage>;

pub type NullifierReadRequestHints<let PendingReadHintsLen: u32, let SettledReadHintsLen: u32> = ReadRequestHints<MAX_NULLIFIER_READ_REQUESTS_PER_TX, PendingReadHintsLen, SettledReadHintsLen, NULLIFIER_TREE_HEIGHT, NullifierLeafPreimage>;

/// Hints provided to the private kernel reset circuit via private inputs.
pub struct PrivateKernelResetHints<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> {
    pub note_hash_read_request_hints: NoteHashReadRequestHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen>,
    pub nullifier_read_request_hints: NullifierReadRequestHints<NullifierPendingReadHintsLen, NullifierSettledReadHintsLen>,
    pub key_validation_hints: [KeyValidationHint; KeyValidationHintsLen],
    pub transient_data_squashing_hints: [TransientDataSquashingHint; TransientDataSquashingHintsLen],
    // Provided as a hint because the `min_revertible_side_effect_counter` might not be set yet at the time a reset
    // circuit is executed. This counter is used to squash transient data. It will be set to `validation_requests` and
    // checked against the actual `min_revertible_side_effect_counter` in the tail circuit.
    pub min_revertible_side_effect_counter: u32,
}
