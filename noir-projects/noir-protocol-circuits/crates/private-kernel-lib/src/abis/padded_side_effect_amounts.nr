use dep::types::traits::Empty;

pub struct PaddedSideEffectAmounts {
    pub non_revertible_note_hashes: u32,
    pub revertible_note_hashes: u32,
    pub non_revertible_nullifiers: u32,
    pub revertible_nullifiers: u32,
    pub non_revertible_private_logs: u32,
    pub revertible_private_logs: u32,
}

impl Empty for PaddedSideEffectAmounts {
    fn empty() -> Self {
        PaddedSideEffectAmounts {
            non_revertible_note_hashes: 0,
            revertible_note_hashes: 0,
            non_revertible_nullifiers: 0,
            revertible_nullifiers: 0,
            non_revertible_private_logs: 0,
            revertible_private_logs: 0,
        }
    }
}
