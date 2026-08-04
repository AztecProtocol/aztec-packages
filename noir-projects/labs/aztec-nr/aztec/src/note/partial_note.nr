//! Partial notes.

/// Domain separator for partial note commitments.
///
/// A partial note commitment is the first round of hashing of a partial note, combining the private fields before the
/// public completion fields (storage slot and public note data) are mixed in.
pub global DOM_SEP__PARTIAL_NOTE_COMMITMENT: u32 = 568912195;

/// Domain separator for partial note completion log tags.
pub global DOM_SEP__NOTE_COMPLETION_LOG_TAG: u32 = 3372669888;
