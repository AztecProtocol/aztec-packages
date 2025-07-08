use dep::types::{
    abis::{
        note_hash::ScopedNoteHash,
        private_log::PrivateLogData,
        side_effect::{Ordered, scoped::Scoped},
    },
    utils::arrays::{ClaimedLengthArray, find_index_hint},
};

/// Validates that a given note log is correctly linked to a note hash at the provided index hint.
/// This function assumes the index hint has been found using `find_index_hint`.
fn validate_note_log_linked_to_note_hash_with_hint<let NUM_NOTE_HASHES: u32>(
    log: Scoped<PrivateLogData>,
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
    note_hash_index_hint: u32,
) {
    // Ensure the note hash index is within the claimed length of the note hashes array.
    // This prevents malicious users creating fake note hashes beyond the claimed length and linking note logs to them,
    // that would otherwise fail to find a matching note hash.
    assert(
        note_hash_index_hint < note_hashes.length,
        "Note hash index hint exceeds claimed length",
    );

    let note_hash = note_hashes.array[note_hash_index_hint];
    // Ensure the note log's `note_hash_counter` matches the counter of the note hash at the hinted index.
    assert_eq(
        log.inner.note_hash_counter,
        note_hash.counter(),
        "Can not find a note hash linked to note log",
    );
    // Ensure the contract address of the note log matches the contract address of the corresponding note hash.
    assert_eq(
        log.contract_address,
        note_hash.contract_address,
        "Can not link a note log to a note hash in another contract",
    );
}

/// Validates that all private logs with a non-zero `note_hash_counter` (i.e. note logs) are linked to a note hash.
/// Logs with `note_hash_counter == 0` are not considered linked and are skipped.
///
/// For each note log:
/// - Searches for a note hash with a matching counter.
/// - Uses the matching index as a hint to validate the link using `validate_note_log_linked_to_note_hash_with_hint`.
///
/// Note: It also checks logs beyond the claimed length of the logs array.
pub fn validate_note_logs_linked_to_note_hashes<let NUM_LOGS: u32, let NUM_NOTE_HASHES: u32>(
    logs: ClaimedLengthArray<Scoped<PrivateLogData>, NUM_LOGS>,
    note_hashes: ClaimedLengthArray<ScopedNoteHash, NUM_NOTE_HASHES>,
) {
    for i in 0..NUM_LOGS {
        let log = logs.array[i];
        if log.inner.note_hash_counter != 0 {
            // Safety: the index is constrained by the checks below.
            let note_hash_index_hint = unsafe {
                find_index_hint(
                    note_hashes.array,
                    |n: ScopedNoteHash| n.counter() == log.inner.note_hash_counter,
                )
                    .unwrap_unchecked()
            };

            validate_note_log_linked_to_note_hash_with_hint(log, note_hashes, note_hash_index_hint);
        }
    }
}

mod tests {
    use super::{
        validate_note_log_linked_to_note_hash_with_hint, validate_note_logs_linked_to_note_hashes,
    };
    use dep::types::{
        abis::{
            note_hash::{NoteHash, ScopedNoteHash},
            private_log::PrivateLogData,
            side_effect::scoped::Scoped,
        },
        address::AztecAddress,
        tests::utils::{make_fixture, pad_end_with_empty},
        traits::FromField,
        utils::arrays::ClaimedLengthArray,
    };

    global contract_address: AztecAddress = AztecAddress::from_field(987654);

    fn mock_log(seed: Field, note_hash_counter: u32) -> Scoped<PrivateLogData> {
        let log = make_fixture(seed);
        PrivateLogData { log, note_hash_counter, counter: 1 }.scope(contract_address)
    }

    fn mock_note_hash(seed: Field, counter: u32) -> ScopedNoteHash {
        let note_hash = make_fixture(seed);
        NoteHash { value: note_hash, counter }.scope(contract_address)
    }

    struct TestBuilder {
        logs: ClaimedLengthArray<Scoped<PrivateLogData>, 6>,
        note_hashes: ClaimedLengthArray<ScopedNoteHash, 5>,
        note_hash_index_hint: u32,
    }

    impl TestBuilder {
        fn new() -> Self {
            let note_hashes = [
                mock_note_hash(11, 100), // Linked to log 44 and 77.
                mock_note_hash(22, 200), // Not linked to any logs.
                mock_note_hash(33, 300), // Linked to log 66.
            ];

            let logs = [
                mock_log(44, 100), // Linked to note hash 11.
                mock_log(55, 0), // Not linked to any note hash.
                mock_log(66, 300), // Linked to note hash 33.
                mock_log(77, 100), // Linked to note hash 11.
            ];

            Self {
                logs: ClaimedLengthArray { array: pad_end_with_empty(logs), length: logs.len() },
                note_hashes: ClaimedLengthArray {
                    array: pad_end_with_empty(note_hashes),
                    length: note_hashes.len(),
                },
                note_hash_index_hint: 0,
            }
        }

        fn validate(self) {
            validate_note_logs_linked_to_note_hashes(self.logs, self.note_hashes);
        }

        fn validate_with_index_hint(self) {
            validate_note_log_linked_to_note_hash_with_hint(
                self.logs.array[0],
                self.note_hashes,
                self.note_hash_index_hint,
            );
        }
    }

    #[test]
    fn default_succeeds() {
        let builder = TestBuilder::new();
        builder.validate();
    }

    #[test(should_fail_with = "Can not link a note log to a note hash in another contract")]
    fn mismatch_contract_address_fails() {
        let mut builder = TestBuilder::new();

        // Change the contract address of the log at index 0 to be a different one.
        builder.logs.array[0].contract_address.inner += 1;

        builder.validate();
    }

    #[test(should_fail_with = "Can not find a note hash linked to note log")]
    fn note_hash_not_found_fails() {
        let mut builder = TestBuilder::new();

        // Link the log at index 0 to an non-existent note hash.
        builder.logs.array[0].inner.note_hash_counter = 9999;

        builder.validate();
    }

    #[test(should_fail_with = "Note hash index hint exceeds claimed length")]
    fn linked_note_hash_exceeds_claimed_length_fails() {
        let mut builder = TestBuilder::new();

        // Link the log at index 0 to an non-existent note hash.
        builder.logs.array[0].inner.note_hash_counter = 9999;

        // Add a fake note hash for the log outside of the claimed length.
        let claimed_length = builder.note_hashes.length;
        builder.note_hashes.array[claimed_length + 1] = mock_note_hash(99, 9999);

        builder.validate();
    }

    #[test(should_fail_with = "Can not find a note hash linked to note log")]
    fn random_log_beyond_claimed_length_fails() {
        let mut builder = TestBuilder::new();

        // Add a random log beyond the claimed length.
        let claimed_length = builder.logs.length;
        builder.logs.array[claimed_length + 1] = mock_log(99, 9999);

        builder.validate();
    }

    #[test]
    fn random_note_hash_beyond_claimed_length_succeeds() {
        let mut builder = TestBuilder::new();

        // Add a random note hash beyond the claimed length.
        // This won't cause the test to fail because the test finds the matching note hashes for the note logs. Note
        // hashes not associated with any note logs are ignored, whether they are within or beyond the claimed length.
        let claimed_length = builder.note_hashes.length;
        builder.note_hashes.array[claimed_length + 1] = mock_note_hash(99, 9999);

        builder.validate();
    }

    #[test]
    fn with_index_hint_succeeds() {
        let builder = TestBuilder::new();
        builder.validate_with_index_hint();
    }

    #[test(should_fail_with = "Can not find a note hash linked to note log")]
    fn wrong_index_hint_fails() {
        let mut builder = TestBuilder::new();

        // Change the index to link to another note hash.
        builder.note_hash_index_hint = 1;

        builder.validate_with_index_hint();
    }

    #[test(should_fail_with = "Note hash index hint exceeds claimed length")]
    fn index_hint_exceeds_claimed_length_fails() {
        let mut builder = TestBuilder::new();

        let log = builder.logs.array[0];

        // Add a new note hash for the log outside of the claimed length.
        let claimed_length = builder.note_hashes.length;
        builder.note_hashes.array[claimed_length + 1] =
            mock_note_hash(99, log.inner.note_hash_counter);

        // Change the index to be greater than the claimed length.
        builder.note_hash_index_hint = claimed_length + 1;

        builder.validate_with_index_hint();
    }

    #[test(should_fail_with = "Note hash index hint exceeds claimed length")]
    fn index_hint_out_of_bounds_fails() {
        let mut builder = TestBuilder::new();

        // Change the index to be the array length.
        builder.note_hash_index_hint = builder.note_hashes.length;

        builder.validate_with_index_hint();
    }
}
