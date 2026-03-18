use crate::messages::{discovery::{ComputeNoteHash, ComputeNoteNullifier}, logs::note::MAX_NOTE_PACKED_LEN};

use crate::logging::{aztecnr_debug_log_format, aztecnr_warn_log_format};
use crate::protocol::{
    address::AztecAddress,
    constants::MAX_NOTE_HASHES_PER_TX,
    hash::{compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash},
    traits::ToField,
};

/// A struct with the discovered information of a complete note, required for delivery to PXE. Note that this is *not*
/// the complete note information, since it does not include content, storage slot, etc.
pub(crate) struct DiscoveredNoteInfo {
    pub(crate) note_nonce: Field,
    pub(crate) note_hash: Field,
    pub(crate) inner_nullifier: Field,
}

/// Searches for note nonces that will result in a note that was emitted in a transaction. While rare, it is possible
/// for multiple notes to have the exact same packed content and storage slot but different nonces, resulting in
/// different unique note hashes. Because of this this function returns a *vector* of discovered notes, though in most
/// cases it will contain a single element.
///
/// Due to how nonces are computed, this function requires knowledge of the transaction in which the note was created,
/// more specifically the list of all unique note hashes in it plus the value of its first nullifier.
pub(crate) unconstrained fn attempt_note_nonce_discovery(
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    contract_address: AztecAddress,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    note_type_id: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
) -> BoundedVec<DiscoveredNoteInfo, MAX_NOTE_HASHES_PER_TX> {
    let discovered_notes = &mut BoundedVec::new();

    aztecnr_debug_log_format!(
        "Attempting nonce discovery on {0} potential notes on contract {1} for storage slot {2}",
    )(
        [unique_note_hashes_in_tx.len() as Field, contract_address.to_field(), storage_slot],
    );

    let maybe_note_hash = compute_note_hash(
        packed_note,
        owner,
        storage_slot,
        note_type_id,
        contract_address,
        randomness,
    );

    if maybe_note_hash.is_none() {
        aztecnr_warn_log_format!(
            "Unable to compute note hash for note of id {0} with packed length {1}, skipping nonce discovery",
        )(
            [note_type_id, packed_note.len() as Field],
        );
    } else {
        let note_hash = maybe_note_hash.unwrap();
        let siloed_note_hash = compute_siloed_note_hash(contract_address, note_hash);

        // We need to find nonces (typically just one) that result in the siloed note hash that being uniqued into one
        // of the transaction's effects.
        // The nonce is meant to be derived from the index of the note hash in the transaction effects array. However,
        // due to an issue in the kernels the nonce might actually use any of the possible note hash indices - not
        // necessarily the one that corresponds to the note hash. Hence, we need to try them all.
        for i in 0..MAX_NOTE_HASHES_PER_TX {
            let nonce_for_i = compute_note_hash_nonce(first_nullifier_in_tx, i);
            let unique_note_hash_for_i = compute_unique_note_hash(nonce_for_i, siloed_note_hash);

            let matching_notes = bvec_filter(
                unique_note_hashes_in_tx,
                |unique_note_hash_in_tx| unique_note_hash_in_tx == unique_note_hash_for_i,
            );
            if matching_notes.len() > 1 {
                let identical_note_hashes = matching_notes.len();
                // Note that we don't actually check that the note hashes array contains unique values, only that the
                // note we found is unique. We don't expect for this to ever happen (it'd indicate a malicious node or
                // PXE, which are both assumed to be cooperative) so testing for it just in case is unnecessary, but we
                // _do_ need to handle it if we find a duplicate.
                panic(
                    f"Received {identical_note_hashes} identical note hashes for a transaction - these should all be unique",
                )
            } else if matching_notes.len() == 1 {
                let maybe_inner_nullifier_for_i = compute_note_nullifier(
                    unique_note_hash_for_i,
                    packed_note,
                    owner,
                    storage_slot,
                    note_type_id,
                    contract_address,
                    randomness,
                );

                if maybe_inner_nullifier_for_i.is_none() {
                    // TODO: down the line we want to be able to store notes for which we don't know their nullifier,
                    // e.g. notes that belong to someone that is not us (and for which we therefore don't know their
                    // associated app-siloed nullifer hiding secret key).
                    // https://linear.app/aztec-labs/issue/F-265/store-external-notes
                    aztecnr_warn_log_format!(
                        "Unable to compute nullifier of unique note {0} with note type id {1} and owner {2}, skipping PXE insertion",
                    )(
                        [unique_note_hash_for_i, note_type_id, owner.to_field()],
                    );
                } else {
                    // Note that while we did check that the note hash is the preimage of a unique note hash, we
                    // perform no validations on the nullifier - we fundamentally cannot, since only the application
                    // knows how to compute nullifiers. We simply trust it to have provided the correct one: if it
                    // hasn't, then PXE may fail to realize that a given note has been nullified already, and calls to
                    // the application could result in invalid transactions (with duplicate nullifiers). This is not a
                    // concern because an application already has more direct means of making a call to it fail the
                    // transaction.
                    discovered_notes.push(
                        DiscoveredNoteInfo {
                            note_nonce: nonce_for_i,
                            note_hash,
                            inner_nullifier: maybe_inner_nullifier_for_i.unwrap(),
                        },
                    );
                }
                // We don't exit the loop - it is possible (though rare) for the exact same note content to be present
                // multiple times in the same transaction with different nonces. This typically doesn't happen due to
                // notes containing random values in order to hide their contents.
            }
        }
    }

    aztecnr_debug_log_format!("Found valid nonces for a total of {0} notes")([discovered_notes.len() as Field]);

    *discovered_notes
}

// There is no BoundedVec::filter in the stdlib, so we use this until that is implemented.
unconstrained fn bvec_filter<Env, T, let MAX_LEN: u32>(
    bvec: BoundedVec<T, MAX_LEN>,
    filter: fn[Env](T) -> bool,
) -> BoundedVec<T, MAX_LEN> {
    let filtered = &mut BoundedVec::new();

    bvec.for_each(|value| {
        if filter(value) {
            filtered.push(value);
        }
    });

    *filtered
}

mod test {
    use crate::{
        messages::logs::note::MAX_NOTE_PACKED_LEN,
        note::{
            note_interface::{NoteHash, NoteType},
            note_metadata::SettledNoteMetadata,
            utils::compute_note_hash_for_nullification,
        },
        oracle::random::random,
        test::mocks::mock_note::MockNote,
        utils::array,
    };

    use crate::protocol::{
        address::AztecAddress,
        hash::{compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash},
        traits::{FromField, Packable},
    };

    use super::attempt_note_nonce_discovery;

    // This implementation could be simpler, but this serves as a nice example of the expected flow in a real
    // implementation, and as a sanity check that the interface is sufficient.

    unconstrained fn compute_note_hash(
        packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        owner: AztecAddress,
        storage_slot: Field,
        note_type_id: Field,
        _contract_address: AztecAddress,
        randomness: Field,
    ) -> Option<Field> {
        if (note_type_id == MockNote::get_id()) & (packed_note.len() == <MockNote as Packable>::N) {
            let note = MockNote::unpack(array::subarray(packed_note.storage(), 0));
            Option::some(note.compute_note_hash(owner, storage_slot, randomness))
        } else {
            Option::none()
        }
    }

    unconstrained fn compute_note_nullifier(
        unique_note_hash: Field,
        packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        owner: AztecAddress,
        _storage_slot: Field,
        note_type_id: Field,
        _contract_address: AztecAddress,
        _randomness: Field,
    ) -> Option<Field> {
        if (note_type_id == MockNote::get_id()) & (packed_note.len() == <MockNote as Packable>::N) {
            let note = MockNote::unpack(array::subarray(packed_note.storage(), 0));
            note.compute_nullifier_unconstrained(owner, unique_note_hash)
        } else {
            Option::none()
        }
    }

    global VALUE: Field = 7;
    global FIRST_NULLIFIER_IN_TX: Field = 47;
    global CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(13);
    global OWNER: AztecAddress = AztecAddress::from_field(14);
    global STORAGE_SLOT: Field = 99;
    global RANDOMNESS: Field = 99;

    #[test]
    unconstrained fn no_note_hashes() {
        let unique_note_hashes_in_tx = BoundedVec::new();
        let packed_note = BoundedVec::new();

        let discovered_notes = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            compute_note_hash,
            compute_note_nullifier,
            CONTRACT_ADDRESS,
            OWNER,
            STORAGE_SLOT,
            RANDOMNESS,
            MockNote::get_id(),
            packed_note,
        );

        assert_eq(discovered_notes.len(), 0);
    }

    #[test]
    unconstrained fn failed_hash_computation_is_ignored() {
        let unique_note_hashes_in_tx = BoundedVec::from_array([random()]);

        let discovered_notes = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            |_, _, _, _, _, _| Option::none(),
            compute_note_nullifier,
            CONTRACT_ADDRESS,
            OWNER,
            STORAGE_SLOT,
            RANDOMNESS,
            MockNote::get_id(),
            BoundedVec::new(),
        );

        assert_eq(discovered_notes.len(), 0);
    }

    #[test]
    unconstrained fn failed_nullifier_computation_is_ignored() {
        let note_index_in_tx = 2;
        let note_and_data = construct_note(VALUE, note_index_in_tx);

        let mut unique_note_hashes_in_tx = BoundedVec::from_array([
            random(), random(), random(), random(), random(), random(), random(),
        ]);
        unique_note_hashes_in_tx.set(note_index_in_tx, note_and_data.unique_note_hash);

        let discovered_notes = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            compute_note_hash,
            |_, _, _, _, _, _, _| Option::none(),
            CONTRACT_ADDRESS,
            OWNER,
            STORAGE_SLOT,
            RANDOMNESS,
            MockNote::get_id(),
            BoundedVec::from_array(note_and_data.note.pack()),
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

        let hinted_note = MockNote::new(value)
            .contract_address(CONTRACT_ADDRESS)
            .owner(OWNER)
            .randomness(RANDOMNESS)
            .storage_slot(STORAGE_SLOT)
            .note_metadata(SettledNoteMetadata::new(note_nonce).into())
            .build_hinted_note();
        let note = hinted_note.note;

        let note_hash = note.compute_note_hash(OWNER, STORAGE_SLOT, RANDOMNESS);
        let unique_note_hash = compute_unique_note_hash(
            note_nonce,
            compute_siloed_note_hash(CONTRACT_ADDRESS, note_hash),
        );
        let inner_nullifier = note
            .compute_nullifier_unconstrained(OWNER, compute_note_hash_for_nullification(hinted_note))
            .expect(f"Could not compute nullifier for note owned by {OWNER}");

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
            compute_note_hash,
            compute_note_nullifier,
            CONTRACT_ADDRESS,
            OWNER,
            STORAGE_SLOT,
            RANDOMNESS,
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
            compute_note_hash,
            compute_note_nullifier,
            CONTRACT_ADDRESS,
            OWNER,
            STORAGE_SLOT,
            RANDOMNESS,
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

    #[test]
    unconstrained fn single_note_misaligned_nonce() {
        let note_index_in_tx = 2;
        let note_and_data = construct_note(VALUE, note_index_in_tx);

        let mut unique_note_hashes_in_tx = BoundedVec::from_array([
            random(), random(), random(), random(), random(), random(), random(),
        ]);

        // The note is not at the correct index
        unique_note_hashes_in_tx.set(note_index_in_tx + 1, note_and_data.unique_note_hash);

        let discovered_notes = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            compute_note_hash,
            compute_note_nullifier,
            CONTRACT_ADDRESS,
            OWNER,
            STORAGE_SLOT,
            RANDOMNESS,
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
    unconstrained fn single_note_nonce_with_index_past_note_hashes_in_tx() {
        let mut unique_note_hashes_in_tx = BoundedVec::from_array([
            random(), random(), random(), random(), random(), random(), random(),
        ]);

        // The nonce is computed with an index that does not exist in the tx
        let note_index_in_tx = unique_note_hashes_in_tx.len() + 5;
        let note_and_data = construct_note(VALUE, note_index_in_tx);

        // The note is inserted at an arbitrary index - its true index is out of the array's bounds
        unique_note_hashes_in_tx.set(2, note_and_data.unique_note_hash);

        let discovered_notes = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            compute_note_hash,
            compute_note_nullifier,
            CONTRACT_ADDRESS,
            OWNER,
            STORAGE_SLOT,
            RANDOMNESS,
            MockNote::get_id(),
            BoundedVec::from_array(note_and_data.note.pack()),
        );

        assert_eq(discovered_notes.len(), 1);
        let discovered_note = discovered_notes.get(0);

        assert_eq(discovered_note.note_nonce, note_and_data.note_nonce);
        assert_eq(discovered_note.note_hash, note_and_data.note_hash);
        assert_eq(discovered_note.inner_nullifier, note_and_data.inner_nullifier);
    }

    #[test(should_fail_with = "identical note hashes for a transaction")]
    unconstrained fn duplicate_unique_note_hashes() {
        let note_index_in_tx = 2;
        let note_and_data = construct_note(VALUE, note_index_in_tx);

        let mut unique_note_hashes_in_tx = BoundedVec::from_array([
            random(), random(), random(), random(), random(), random(), random(),
        ]);

        // The same unique note hash is present in two indices in the array, which is not allowed. Note that we don't
        // test all note hashes for uniqueness, only those that we actually find.
        unique_note_hashes_in_tx.set(note_index_in_tx, note_and_data.unique_note_hash);
        unique_note_hashes_in_tx.set(note_index_in_tx + 1, note_and_data.unique_note_hash);

        let _ = attempt_note_nonce_discovery(
            unique_note_hashes_in_tx,
            FIRST_NULLIFIER_IN_TX,
            compute_note_hash,
            compute_note_nullifier,
            CONTRACT_ADDRESS,
            OWNER,
            STORAGE_SLOT,
            RANDOMNESS,
            MockNote::get_id(),
            BoundedVec::from_array(note_and_data.note.pack()),
        );
    }
}
