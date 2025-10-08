use crate::reset::transient_data::{
    derived_hints::{build_derived_hints, DerivedHints},
    transient_data_squashing_hint::TransientDataSquashingHint,
    transient_data_validator::TransientDataValidator,
};
use dep::types::{
    abis::{
        note_hash::{NoteHash, ScopedNoteHash},
        nullifier::{Nullifier, ScopedNullifier},
        private_log::{PrivateLog, PrivateLogData},
        side_effect::scoped::Scoped,
    },
    address::AztecAddress,
    constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    traits::{Empty, FromField},
    utils::arrays::ClaimedLengthArray,
};

global contract_address: AztecAddress = AztecAddress::from_field(987654);

pub fn mock_log(filled_with: Field) -> PrivateLog {
    PrivateLog::new(
        [filled_with; PRIVATE_LOG_SIZE_IN_FIELDS],
        PRIVATE_LOG_SIZE_IN_FIELDS,
    )
}

pub struct TransientDataFixtureBuilder<let NoteHashesLen: u32, let NullifiersLen: u32, let LogsLen: u32, let SquashingHintsLen: u32> {
    pub note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    pub nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    pub logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    pub expected_kept_note_hashes: ClaimedLengthArray<ScopedNoteHash, NoteHashesLen>,
    pub expected_kept_nullifiers: ClaimedLengthArray<ScopedNullifier, NullifiersLen>,
    pub expected_kept_logs: ClaimedLengthArray<Scoped<PrivateLogData>, LogsLen>,
    pub min_revertible_side_effect_counter: u32,
    pub transient_data_squashing_hints: [TransientDataSquashingHint; SquashingHintsLen],
    num_transient_data_squashing_hints: u32,
}

impl TransientDataFixtureBuilder<6, 5, 7, 4> {
    /// Create a test case with maximum 6 note hashes, 5 nullifiers, 7 logs, and 4 squashing hints.
    pub fn new() -> Self {
        Self::empty()
    }
}

impl<let NoteHashesLen: u32, let NullifiersLen: u32, let LogsLen: u32, let SquashingHintsLen: u32> TransientDataFixtureBuilder<NoteHashesLen, NullifiersLen, LogsLen, SquashingHintsLen> {
    pub fn empty() -> Self {
        TransientDataFixtureBuilder {
            note_hashes: ClaimedLengthArray::empty(),
            nullifiers: ClaimedLengthArray::empty(),
            logs: ClaimedLengthArray::empty(),
            expected_kept_note_hashes: ClaimedLengthArray::empty(),
            expected_kept_nullifiers: ClaimedLengthArray::empty(),
            expected_kept_logs: ClaimedLengthArray::empty(),
            min_revertible_side_effect_counter: 0,
            transient_data_squashing_hints: [
                TransientDataSquashingHint::skip(NoteHashesLen, NullifiersLen); SquashingHintsLen
            ],
            num_transient_data_squashing_hints: 0,
        }
    }

    pub fn add_note_hashes<let N: u32>(&mut self, note_hashes: [NoteHash; N]) {
        for i in 0..N {
            self.note_hashes.push(note_hashes[i].scope(contract_address));
        }
    }

    pub fn add_nullifiers<let N: u32>(&mut self, nullifiers: [Nullifier; N]) {
        for i in 0..N {
            self.nullifiers.push(nullifiers[i].scope(contract_address));
        }
    }

    pub fn add_logs<let N: u32>(&mut self, logs: [PrivateLogData; N]) {
        for i in 0..N {
            self.logs.push(logs[i].scope(contract_address));
        }
    }

    pub fn add_squashing_hint(&mut self, note_hash_index: u32, nullifier_index: u32) {
        self.transient_data_squashing_hints[self.num_transient_data_squashing_hints] =
            TransientDataSquashingHint { nullifier_index, note_hash_index };
        self.num_transient_data_squashing_hints += 1;
    }

    pub fn keep_note_hashes<let N: u32>(&mut self, note_hash_indices: [u32; N]) {
        for i in 0..N {
            self.expected_kept_note_hashes.push(self.note_hashes.array[note_hash_indices[i]]);
        }
    }

    pub fn keep_nullifiers<let N: u32>(&mut self, nullifier_indices: [u32; N]) {
        for i in 0..N {
            self.expected_kept_nullifiers.push(self.nullifiers.array[nullifier_indices[i]]);
        }
    }

    pub fn keep_logs<let N: u32>(&mut self, log_indices: [u32; N]) {
        for i in 0..N {
            self.expected_kept_logs.push(self.logs.array[log_indices[i]]);
        }
    }

    pub fn get_skip_index_hint(_self: Self) -> TransientDataSquashingHint {
        TransientDataSquashingHint::skip(NoteHashesLen, NullifiersLen)
    }

    pub fn build_derived_hints(
        self,
    ) -> DerivedHints<SquashingHintsLen, NoteHashesLen, NullifiersLen, LogsLen> {
        // Safety: This is only used in tests.
        unsafe {
            build_derived_hints(
                self.note_hashes,
                self.nullifiers,
                self.logs,
                self.expected_kept_note_hashes,
                self.transient_data_squashing_hints,
            )
        }
    }

    pub fn validate(self) {
        TransientDataValidator::new(
            self.note_hashes,
            self.nullifiers,
            self.logs,
            self.expected_kept_note_hashes,
            self.expected_kept_nullifiers,
            self.expected_kept_logs,
            self.min_revertible_side_effect_counter,
            self.transient_data_squashing_hints,
        )
            .validate();
    }

    pub fn validate_with_derived_hints(
        self,
        derived_hints: DerivedHints<SquashingHintsLen, NoteHashesLen, NullifiersLen, LogsLen>,
    ) {
        TransientDataValidator {
            note_hashes: self.note_hashes,
            nullifiers: self.nullifiers,
            logs: self.logs,
            expected_kept_note_hashes: self.expected_kept_note_hashes,
            expected_kept_nullifiers: self.expected_kept_nullifiers,
            expected_kept_logs: self.expected_kept_logs,
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            transient_data_squashing_hints: self.transient_data_squashing_hints,
            derived_hints,
        }
            .validate();
    }
}
