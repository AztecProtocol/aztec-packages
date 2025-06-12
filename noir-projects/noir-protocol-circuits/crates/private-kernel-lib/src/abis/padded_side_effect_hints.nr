use dep::types::{
    abis::private_log::PrivateLog,
    constants::{MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX},
    traits::Empty,
};

#[derive(Eq)]
pub struct PaddedSideEffectHints {
    // [0, 0, 0, 0, 0 | p, p, p, p, 0, 0, 0] <-- empty until padding, then empty thereafter
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
}

impl Empty for PaddedSideEffectHints {
    fn empty() -> Self {
        PaddedSideEffectHints {
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
        }
    }
}
