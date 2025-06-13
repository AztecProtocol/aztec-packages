use crate::messages::discovery::{ComputeNoteHashAndNullifier, private_notes::MAX_NOTE_PACKED_LEN};

use dep::protocol_types::{
    address::AztecAddress,
    constants::MAX_NOTE_HASHES_PER_TX,
    debug_log::debug_log_format,
    hash::{compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash},
    traits::ToField,
};

/// A struct with the discovered information of a complete note, required for delivery to PXE. Note that this is *not*
/// the complete note information, since it does not include content, storage slot, etc.
pub struct DiscoveredNoteInfo {
    pub note_nonce: Field,
    pub note_hash: Field,
    pub inner_nullifier: Field,
}

/// Searches for note nonces that will result in a note that was emitted in a transaction. While rare, it is possible
/// for multiple notes to have the exact same packed content and storage slot but different nonces, resulting in
/// different unique note hashes. Because of this this function returns a *vector* of discovered notes, though in most
/// cases it will contain a single element.
///
/// Due to how nonces are computed, this function requires knowledge of the transaction in which the note was created,
/// more specifically the list of all unique note hashes in it plus the value of its first nullifier.
pub unconstrained fn attempt_note_nonce_discovery<Env>(
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    contract_address: AztecAddress,
    storage_slot: Field,
    note_type_id: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
) -> BoundedVec<DiscoveredNoteInfo, MAX_NOTE_HASHES_PER_TX> {
    let discovered_notes = &mut BoundedVec::new();

    debug_log_format(
        "Attempting nonce discovery on {0} potential notes on contract {1} for storage slot {2}",
        [unique_note_hashes_in_tx.len() as Field, contract_address.to_field(), storage_slot],
    );

    // We need to find nonces (typically just one) that result in a note hash that, once siloed into a unique note hash,
    // is one of the note hashes created by the transaction.
    unique_note_hashes_in_tx.for_eachi(|i, expected_unique_note_hash| {
        // Nonces are computed by hashing the first nullifier in the transaction with the index of the note in the
        // new note hashes array. We therefore know for each note in every transaction what its nonce is.
        let candidate_nonce = compute_note_hash_nonce(first_nullifier_in_tx, i);

        // Given note nonce, note content and metadata, we can compute the note hash and silo it to check if it matches
        // the note hash at the array index we're currently processing.
        // TODO(#11157): handle failed note_hash_and_nullifier computation
        let hashes = compute_note_hash_and_nullifier(
            packed_note,
            storage_slot,
            note_type_id,
            contract_address,
            candidate_nonce,
        )
            .expect(f"Failed to compute a note hash for note type {note_type_id}");

        let siloed_note_hash = compute_siloed_note_hash(contract_address, hashes.note_hash);
        let unique_note_hash = compute_unique_note_hash(candidate_nonce, siloed_note_hash);

        if unique_note_hash == expected_unique_note_hash {
            // Note that while we did check that the note hash is the preimage of the expected unique note hash, we
            // perform no validations on the nullifier - we fundamentally cannot, since only the application knows
            // how to compute nullifiers. We simply trust it to have provided the correct one: if it hasn't, then
            // PXE may fail to realize that a given note has been nullified already, and calls to the application
            // could result in invalid transactions (with duplicate nullifiers). This is not a concern because an
            // application already has more direct means of making a call to it fail the transaction.
            discovered_notes.push(
                DiscoveredNoteInfo {
                    note_nonce: candidate_nonce,
                    note_hash: hashes.note_hash,
                    inner_nullifier: hashes.inner_nullifier,
                },
            );

            // We don't exit the loop - it is possible (though rare) for the exact same note content to be present
            // multiple times in the same transaction with different nonces. This typically doesn't happen due to
            // notes containing random values in order to hide their contents.
        }
    });

    debug_log_format(
        "Discovered a total of {0} notes",
        [discovered_notes.len() as Field],
    );

    *discovered_notes
}

mod test {
    use crate::{
        messages::discovery::{NoteHashAndNullifier, private_notes::MAX_NOTE_PACKED_LEN},
        note::{
            note_interface::{NoteHash, NoteType},
            note_metadata::SettledNoteMetadata,
            retrieved_note::RetrievedNote,
            utils::compute_note_hash_for_nullify,
        },
        oracle::random::random,
        test::mocks::mock_note::MockNote,
        utils::array,
    };

    use dep::protocol_types::{
        address::AztecAddress,
        hash::{compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash},
        traits::{FromField, Packable},
    };

    use super::attempt_note_nonce_discovery;

    // This implementation could be simpler, but this serves as a nice example of the expected flow in a real
    // implementation, and as a sanity check that the interface is sufficient.
    unconstrained fn compute_note_hash_and_nullifier(
        packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        storage_slot: Field,
        note_type_id: Field,
        contract_address: AztecAddress,
        note_nonce: Field,
    ) -> Option<NoteHashAndNullifier> {
        if note_type_id == MockNote::get_id() {
            let note = MockNote::unpack(array::subarray(packed_note.storage(), 0));
            let note_hash = note.compute_note_hash(storage_slot);

            let note_hash_for_nullify = compute_note_hash_for_nullify(
                RetrievedNote {
                    note,
                    contract_address,
                    metadata: SettledNoteMetadata::new(note_nonce).into(),
                },
                storage_slot,
            );

            let inner_nullifier = note.compute_nullifier_unconstrained(note_hash_for_nullify);

            Option::some(NoteHashAndNullifier { note_hash, inner_nullifier })
        } else {
            Option::none()
        }
    }

    global VALUE: Field = 7;
    global FIRST_NULLIFIER_IN_TX: Field = 47;
    global CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(13);
    global STORAGE_SLOT: Field = 99;

    #[test]
    unconstrained fn no_note_hashes() {
        let unique_note_hashes_in_tx = BoundedVec::new();
        let packed_note = BoundedVec::new();

        let discovered_notes = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            compute_note_hash_and_nullifier,
            CONTRACT_ADDRESS,
            STORAGE_SLOT,
            MockNote::get_id(),
            packed_note,
        );

        assert_eq(discovered_notes.len(), 0);
    }

    #[test(should_fail_with = "Failed to compute a note hash")]
    unconstrained fn failed_hash_computation() {
        let unique_note_hashes_in_tx = BoundedVec::from_array([random()]);
        let packed_note = BoundedVec::new();
        let note_type_id = 0; // This note type id is unknown to compute_note_hash_and_nullifier

        let discovered_notes = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            compute_note_hash_and_nullifier,
            CONTRACT_ADDRESS,
            STORAGE_SLOT,
            note_type_id,
            packed_note,
        );

        assert_eq(discovered_notes.len(), 0);
    }

    struct NoteAndData {
        note: MockNote,
        note_nonce: Field,
        note_hash: Field,
        unique_note_hash: Field,
        inner_nullifier: Field,
    }

    unconstrained fn construct_note(value: Field, note_index_in_tx: u32) -> NoteAndData {
        let note_nonce = compute_note_hash_nonce(FIRST_NULLIFIER_IN_TX, note_index_in_tx);

        let retrieved_note = MockNote::new(value)
            .contract_address(CONTRACT_ADDRESS)
            .note_metadata(SettledNoteMetadata::new(note_nonce).into())
            .build_retrieved_note();
        let note = retrieved_note.note;

        let note_hash = note.compute_note_hash(STORAGE_SLOT);
        let unique_note_hash = compute_unique_note_hash(
            note_nonce,
            compute_siloed_note_hash(CONTRACT_ADDRESS, note_hash),
        );
        let inner_nullifier = note.compute_nullifier_unconstrained(compute_note_hash_for_nullify(
            retrieved_note,
            STORAGE_SLOT,
        ));

        NoteAndData { note, note_nonce, note_hash, unique_note_hash, inner_nullifier }
    }

    #[test]
    unconstrained fn single_note() {
        let note_index_in_tx = 2;
        let note_and_data = construct_note(VALUE, note_index_in_tx);

        let mut unique_note_hashes_in_tx = BoundedVec::from_array([
            random(), random(), random(), random(), random(), random(), random(),
        ]);
        unique_note_hashes_in_tx.set(note_index_in_tx, note_and_data.unique_note_hash);

        let discovered_notes = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            compute_note_hash_and_nullifier,
            CONTRACT_ADDRESS,
            STORAGE_SLOT,
            MockNote::get_id(),
            BoundedVec::from_array(note_and_data.note.pack()),
        );

        assert_eq(discovered_notes.len(), 1);
        let discovered_note = discovered_notes.get(0);

        assert_eq(discovered_note.note_nonce, note_and_data.note_nonce);
        assert_eq(discovered_note.note_hash, note_and_data.note_hash);
        assert_eq(discovered_note.inner_nullifier, note_and_data.inner_nullifier);
    }

    #[test]
    unconstrained fn multiple_notes_same_preimage() {
        let first_note_index_in_tx = 3;
        let first_note_and_data = construct_note(VALUE, first_note_index_in_tx);

        let second_note_index_in_tx = 5;
        let second_note_and_data = construct_note(VALUE, second_note_index_in_tx);

        // Both notes have the same preimage (and therefore packed representation), so both should be found in the same
        // call.
        assert_eq(first_note_and_data.note, second_note_and_data.note);
        let packed_note = first_note_and_data.note.pack();

        let mut unique_note_hashes_in_tx = BoundedVec::from_array([
            random(), random(), random(), random(), random(), random(), random(),
        ]);
        unique_note_hashes_in_tx.set(first_note_index_in_tx, first_note_and_data.unique_note_hash);
        unique_note_hashes_in_tx.set(second_note_index_in_tx, second_note_and_data.unique_note_hash);

        let discovered_notes = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            compute_note_hash_and_nullifier,
            CONTRACT_ADDRESS,
            STORAGE_SLOT,
            MockNote::get_id(),
            BoundedVec::from_array(packed_note),
        );

        assert_eq(discovered_notes.len(), 2);

        assert(discovered_notes.any(|discovered_note| {
            (discovered_note.note_nonce == first_note_and_data.note_nonce)
                & (discovered_note.note_hash == first_note_and_data.note_hash)
                & (discovered_note.inner_nullifier == first_note_and_data.inner_nullifier)
        }));

        assert(discovered_notes.any(|discovered_note| {
            (discovered_note.note_nonce == second_note_and_data.note_nonce)
                & (discovered_note.note_hash == second_note_and_data.note_hash)
                & (discovered_note.inner_nullifier == second_note_and_data.inner_nullifier)
        }));
    }
}
