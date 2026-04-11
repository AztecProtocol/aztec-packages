use crate::logging;
use crate::macros::{notes::NOTES, utils::get_trait_impl_method};

/// Generates two contract library methods called `_compute_note_hash` and `_compute_note_nullifier`, plus a
/// (deprecated) wrapper called `_compute_note_hash_and_nullifier`, which are used for note discovery (i.e. these are
/// of the `aztec::messages::discovery::ComputeNoteHash` and `aztec::messages::discovery::ComputeNoteNullifier` types).
pub(crate) comptime fn generate_contract_library_methods_compute_note_hash_and_nullifier() -> Quoted {
    let compute_note_hash = generate_contract_library_method_compute_note_hash();
    let compute_note_nullifier = generate_contract_library_method_compute_note_nullifier();

    quote {
        $compute_note_hash
        $compute_note_nullifier

        /// Unpacks an array into a note corresponding to `note_type_id` and then computes its note hash (non-siloed) and inner nullifier (non-siloed) assuming the note has been inserted into the note hash tree with `note_nonce`.
        ///
        /// This function is automatically injected by the `#[aztec]` macro.
        #[contract_library_method]
        #[allow(dead_code)]
        unconstrained fn _compute_note_hash_and_nullifier(
            packed_note: BoundedVec<Field, aztec::messages::logs::note::MAX_NOTE_PACKED_LEN>,
            owner: aztec::protocol::address::AztecAddress,
            storage_slot: Field,
            note_type_id: Field,
            contract_address: aztec::protocol::address::AztecAddress,
            randomness: Field,
            note_nonce: Field,
        ) -> Option<aztec::messages::discovery::NoteHashAndNullifier> {
            _compute_note_hash(packed_note, owner, storage_slot, note_type_id, contract_address, randomness).map(|note_hash| {

                let siloed_note_hash = aztec::protocol::hash::compute_siloed_note_hash(contract_address, note_hash);
                let unique_note_hash = aztec::protocol::hash::compute_unique_note_hash(note_nonce, siloed_note_hash);
                
                let inner_nullifier = _compute_note_nullifier(unique_note_hash, packed_note, owner, storage_slot, note_type_id, contract_address, randomness);

                aztec::messages::discovery::NoteHashAndNullifier {
                    note_hash,
                    inner_nullifier,
                }
            })
        }
    }
}

comptime fn generate_contract_library_method_compute_note_hash() -> Quoted {
    if NOTES.len() == 0 {
        // Contracts with no notes still implement this function to avoid having special-casing, the implementation
        // simply throws immediately.
        quote {
            /// This contract does not use private notes, so this function should never be called as it will unconditionally fail.
            ///
            /// This function is automatically injected by the `#[aztec]` macro.
            #[contract_library_method]
            unconstrained fn _compute_note_hash(
                _packed_note: BoundedVec<Field, aztec::messages::logs::note::MAX_NOTE_PACKED_LEN>,
                _owner: aztec::protocol::address::AztecAddress,
                _storage_slot: Field,
                _note_type_id: Field,
                _contract_address: aztec::protocol::address::AztecAddress,
                _randomness: Field,
            ) -> Option<Field> {
                panic(f"This contract does not use private notes")
            }
        }
    } else {
        // Contracts that do define notes produce an if-else chain where `note_type_id` is matched against the
        // `get_note_type_id()` function of each note type that we know of, in order to identify the note type. Once we
        // know it we call the correct `unpack` method from the `Packable` trait to obtain the underlying
        // note type, and compute the note hash (non-siloed).

        // We resolve the log format calls here so that the resulting Quoted values can be spliced into the quote
        // block below.
        let warn_length_mismatch = logging::aztecnr_warn_log_format(
            "Packed note length mismatch for note type id {0}: expected {1} fields, got {2}. Skipping note.",
        );
        let warn_unknown_note_type = logging::aztecnr_warn_log_format("Unknown note type id {0}. Skipping note.");

        let mut if_note_type_id_match_statements_list = @[];
        for i in 0..NOTES.len() {
            let typ = NOTES.get(i);

            let get_note_type_id = get_trait_impl_method(
                typ,
                quote { crate::note::note_interface::NoteType },
                quote { get_id },
            );
            let unpack = get_trait_impl_method(
                typ,
                quote { crate::protocol::traits::Packable },
                quote { unpack },
            );

            let compute_note_hash = get_trait_impl_method(
                typ,
                quote { crate::note::note_interface::NoteHash },
                quote { compute_note_hash },
            );

            let if_or_else_if = if i == 0 {
                quote { if }
            } else {
                quote { else if }
            };

            if_note_type_id_match_statements_list = if_note_type_id_match_statements_list.push_back(
                quote {
                    $if_or_else_if note_type_id == $get_note_type_id() {
                        // As an extra safety check we make sure that the packed_note BoundedVec has the expected
                        // length, since we're about to interpret its raw storage as a fixed-size array by calling the
                        // unpack function on it.
                        let expected_len = <$typ as $crate::protocol::traits::Packable>::N;
                        let actual_len = packed_note.len();
                        if actual_len != expected_len {
                            $warn_length_mismatch([note_type_id, expected_len as Field, actual_len as Field]);
                            Option::none()
                        } else {
                            let note = $unpack(aztec::utils::array::subarray(packed_note.storage(), 0));

                            Option::some($compute_note_hash(note, owner, storage_slot, randomness))
                        }
                    }
                },
            );
        }

        let if_note_type_id_match_statements = if_note_type_id_match_statements_list.join(quote {});

        quote {
            /// Unpacks an array into a note corresponding to `note_type_id` and then computes its note hash (non-siloed).
            ///
            /// The signature of this function notably matches the `aztec::messages::discovery::ComputeNoteHash` type, and so it can be used to call functions from that module such as `do_sync_state` and `attempt_note_discovery`.
            ///
            /// This function is automatically injected by the `#[aztec]` macro.
            #[contract_library_method]
            unconstrained fn _compute_note_hash(
                packed_note: BoundedVec<Field, aztec::messages::logs::note::MAX_NOTE_PACKED_LEN>,
                owner: aztec::protocol::address::AztecAddress,
                storage_slot: Field,
                note_type_id: Field,
                _contract_address: aztec::protocol::address::AztecAddress,
                randomness: Field,
            ) -> Option<Field> {
                $if_note_type_id_match_statements
                else {
                    $warn_unknown_note_type([note_type_id]);
                    Option::none()
                }
            }
        }
    }
}

comptime fn generate_contract_library_method_compute_note_nullifier() -> Quoted {
    if NOTES.len() == 0 {
        // Contracts with no notes still implement this function to avoid having special-casing, the implementation
        // simply throws immediately.
        quote {
            /// This contract does not use private notes, so this function should never be called as it will unconditionally fail.
            ///
            /// This function is automatically injected by the `#[aztec]` macro.
            #[contract_library_method]
            unconstrained fn _compute_note_nullifier(
                _unique_note_hash: Field,
                _packed_note: BoundedVec<Field, aztec::messages::logs::note::MAX_NOTE_PACKED_LEN>,
                _owner: aztec::protocol::address::AztecAddress,
                _storage_slot: Field,
                _note_type_id: Field,
                _contract_address: aztec::protocol::address::AztecAddress,
                _randomness: Field,
            ) -> Option<Field> {
                panic(f"This contract does not use private notes")
            }
        }
    } else {
        // Contracts that do define notes produce an if-else chain where `note_type_id` is matched against the
        // `get_note_type_id()` function of each note type that we know of, in order to identify the note type. Once we
        // know it we call the correct `unpack` method from the `Packable` trait to obtain the underlying
        // note type, and compute the inner nullifier (non-siloed).

        // We resolve the log format calls here so that the resulting Quoted values can be spliced into the quote
        // block below.
        let warn_length_mismatch = logging::aztecnr_warn_log_format(
            "Packed note length mismatch for note type id {0}: expected {1} fields, got {2}. Skipping note.",
        );
        let warn_unknown_note_type = logging::aztecnr_warn_log_format("Unknown note type id {0}. Skipping note.");

        let mut if_note_type_id_match_statements_list = @[];
        for i in 0..NOTES.len() {
            let typ = NOTES.get(i);

            let get_note_type_id = get_trait_impl_method(
                typ,
                quote { crate::note::note_interface::NoteType },
                quote { get_id },
            );
            let unpack = get_trait_impl_method(
                typ,
                quote { crate::protocol::traits::Packable },
                quote { unpack },
            );

            let compute_nullifier_unconstrained = get_trait_impl_method(
                typ,
                quote { crate::note::note_interface::NoteHash },
                quote { compute_nullifier_unconstrained },
            );

            let if_or_else_if = if i == 0 {
                quote { if }
            } else {
                quote { else if }
            };

            if_note_type_id_match_statements_list = if_note_type_id_match_statements_list.push_back(
                quote {
                    $if_or_else_if note_type_id == $get_note_type_id() {
                        // As an extra safety check we make sure that the packed_note BoundedVec has the expected
                        // length, since we're about to interpret its raw storage as a fixed-size array by calling the
                        // unpack function on it.
                        let expected_len = <$typ as $crate::protocol::traits::Packable>::N;
                        let actual_len = packed_note.len();
                        if actual_len != expected_len {
                            $warn_length_mismatch([note_type_id, expected_len as Field, actual_len as Field]);
                            Option::none()
                        } else {
                            let note = $unpack(aztec::utils::array::subarray(packed_note.storage(), 0));

                            // The message discovery process finds settled notes, that is, notes that were created in
                            // prior transactions and are therefore already part of the note hash tree. The note hash
                            // for nullification is hence the unique note hash.
                            $compute_nullifier_unconstrained(note, owner, unique_note_hash)
                        }
                    }
                },
            );
        }

        let if_note_type_id_match_statements = if_note_type_id_match_statements_list.join(quote {});

        quote {
            /// Computes a note's inner nullifier (non-siloed) given its unique note hash, preimage and extra data.
            ///
            /// The signature of this function notably matches the `aztec::messages::discovery::ComputeNoteNullifier` type, and so it can be used to call functions from that module such as `do_sync_state` and `attempt_note_discovery`.
            ///
            /// This function is automatically injected by the `#[aztec]` macro.
            #[contract_library_method]
            unconstrained fn _compute_note_nullifier(
                unique_note_hash: Field,
                packed_note: BoundedVec<Field, aztec::messages::logs::note::MAX_NOTE_PACKED_LEN>,
                owner: aztec::protocol::address::AztecAddress,
                _storage_slot: Field,
                note_type_id: Field,
                _contract_address: aztec::protocol::address::AztecAddress,
                _randomness: Field,
            ) -> Option<Field> {
                $if_note_type_id_match_statements
                else {
                    $warn_unknown_note_type([note_type_id]);
                    Option::none()
                }
            }
        }
    }
}
