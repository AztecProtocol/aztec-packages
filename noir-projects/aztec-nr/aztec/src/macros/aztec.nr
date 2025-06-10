use crate::{
    macros::{
        dispatch::generate_public_dispatch,
        functions::{stub_registry, utils::check_each_fn_macroified},
        notes::{generate_note_export, NOTES},
        storage::STORAGE_LAYOUT_NAME,
        utils::{get_trait_impl_method, module_has_storage},
    },
    messages::discovery::private_notes::MAX_NOTE_PACKED_LEN,
};

/// Marks a contract as an Aztec contract, generating the interfaces for its functions and notes, as well as injecting
/// the `sync_private_state` utility function.
/// Note: This is a module annotation, so the returned quote gets injected inside the module (contract) itself.
pub comptime fn aztec(m: Module) -> Quoted {
    let interface = generate_contract_interface(m);

    // Functions that don't have #[private], #[public], #[utility], #[contract_library_method], or #[test] are not
    // allowed in contracts.
    check_each_fn_macroified(m);

    let contract_library_method_compute_note_hash_and_nullifier =
        generate_contract_library_method_compute_note_hash_and_nullifier();
    let note_exports = generate_note_exports();
    let public_dispatch = generate_public_dispatch(m);
    let sync_private_state = generate_sync_private_state();
    let process_message = generate_process_message();

    quote {
        $note_exports
        $interface
        $contract_library_method_compute_note_hash_and_nullifier
        $public_dispatch
        $sync_private_state
        $process_message
    }
}

comptime fn generate_contract_interface(m: Module) -> Quoted {
    let module_name = m.name();
    let contract_stubs = stub_registry::get(m);
    let fn_stubs_quote = if contract_stubs.is_some() {
        contract_stubs.unwrap().join(quote {})
    } else {
        quote {}
    };

    let has_storage_layout = module_has_storage(m) & STORAGE_LAYOUT_NAME.get(m).is_some();
    let storage_layout_getter = if has_storage_layout {
        let storage_layout_name = STORAGE_LAYOUT_NAME.get(m).unwrap();
        quote {
            pub fn storage_layout() -> StorageLayoutFields {
                $storage_layout_name.fields
            }
        }
    } else {
        quote {}
    };

    let library_storage_layout_getter = if has_storage_layout {
        quote {
            #[contract_library_method]
            $storage_layout_getter
        }
    } else {
        quote {}
    };

    quote {
        pub struct $module_name {
            pub target_contract: dep::aztec::protocol_types::address::AztecAddress
        }

        impl $module_name {
            $fn_stubs_quote

            pub fn at(
                addr: aztec::protocol_types::address::AztecAddress
            ) -> Self {
                Self { target_contract: addr }
            }

            pub fn interface() -> Self {
                Self { target_contract: aztec::protocol_types::address::AztecAddress::zero() }
            }

            $storage_layout_getter
        }

        #[contract_library_method]
        pub fn at(
            addr: aztec::protocol_types::address::AztecAddress
        ) -> $module_name {
            $module_name { target_contract: addr }
        }

        #[contract_library_method]
        pub fn interface() -> $module_name {
            $module_name { target_contract: aztec::protocol_types::address::AztecAddress::zero() }
        }

        $library_storage_layout_getter

    }
}

/// Generates a contract library method called `_compute_note_hash_and_nullifier` which is used for note
/// discovery (to create the `aztec::messages::discovery::ComputeNoteHashAndNullifier` function) and to implement the
/// `compute_note_hash_and_nullifier` unconstrained contract function.
comptime fn generate_contract_library_method_compute_note_hash_and_nullifier() -> Quoted {
    let notes = NOTES.entries();

    if notes.len() > 0 {
        let max_note_packed_len = notes.fold(
            0,
            |acc, (_, (_, len, _, _)): (Type, (TypeDefinition, u32, Field, [(Quoted, u32, bool)]))| {
                if len > acc {
                    len
                } else {
                    acc
                }
            },
        );

        if max_note_packed_len > MAX_NOTE_PACKED_LEN {
            panic(
                f"One of the notes has packed len {max_note_packed_len} but the maximum is {MAX_NOTE_PACKED_LEN}",
            );
        }

        // Contracts that do define notes produce an if-else chain where `note_type_id` is matched against the
        // `get_note_type_id()` function of each note type that we know of, in order to identify the note type. Once we
        // know it we call we correct `unpack` method from the `Packable` trait to obtain the underlying note type, and
        // compute the note hash (non-siloed) and inner nullifier (also non-siloed).

        let mut if_note_type_id_match_statements_list = &[];
        for i in 0..notes.len() {
            let (typ, (_, packed_note_length, _, _)) = notes[i];

            let get_note_type_id = get_trait_impl_method(
                typ,
                quote { crate::note::note_interface::NoteType },
                quote { get_id },
            );
            let unpack = get_trait_impl_method(
                typ,
                quote { crate::protocol_types::traits::Packable<_> },
                quote { unpack },
            );

            let compute_note_hash = get_trait_impl_method(
                typ,
                quote { crate::note::note_interface::NoteHash },
                quote { compute_note_hash },
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
                        // length, since we're about to interpret it's raw storage as a fixed-size array by calling the
                        // unpack function on it.
                        let expected_len = $packed_note_length;
                        let actual_len = packed_note.len();
                        assert(
                            actual_len == expected_len,
                            f"Expected packed note of length {expected_len} but got {actual_len} for note type id {note_type_id}"
                        );

                        let note = $unpack(aztec::utils::array::subarray(packed_note.storage(), 0));

                        let note_hash = $compute_note_hash(note, storage_slot);
    
                        // The message discovery process finds settled notes, that is, notes that were created in prior
                        // transactions and are therefore already part of the note hash tree. We therefore compute the
                        // nullification note hash by treating the note as a settled note with the provided note nonce.
                        let note_hash_for_nullify = aztec::note::utils::compute_note_hash_for_nullify(
                            aztec::note::retrieved_note::RetrievedNote{ 
                                note, 
                                contract_address, 
                                metadata: aztec::note::note_metadata::SettledNoteMetadata::new(note_nonce).into()
                            }, 
                            storage_slot,
                        );

                        let inner_nullifier = $compute_nullifier_unconstrained(note, note_hash_for_nullify);

                        Option::some(
                            aztec::messages::discovery::NoteHashAndNullifier {
                                note_hash, inner_nullifier
                            }
                        )
                    }
                },
            );
        }

        let if_note_type_id_match_statements = if_note_type_id_match_statements_list.join(quote {});

        quote {
            /// Unpacks an array into a note corresponding to `note_type_id` and then computes its note hash
            /// (non-siloed) and inner nullifier (non-siloed) assuming the note has been inserted into the note hash
            /// tree with `note_nonce`.
            ///
            /// The signature of this function notably matches the `aztec::messages::discovery::ComputeNoteHashAndNullifier` type,
            /// and so it can be used to call functions from that module such as `discover_new_messages`, 
            /// `do_process_log` and `attempt_note_discovery`.
            ///
            /// This function is automatically injected by the `#[aztec]` macro.
            #[contract_library_method]
            unconstrained fn _compute_note_hash_and_nullifier(
                packed_note: BoundedVec<Field, aztec::messages::discovery::private_notes::MAX_NOTE_PACKED_LEN>,
                storage_slot: Field,
                note_type_id: Field,
                contract_address: aztec::protocol_types::address::AztecAddress,
                note_nonce: Field,
            ) -> Option<aztec::messages::discovery::NoteHashAndNullifier> {
                $if_note_type_id_match_statements
                else {
                    Option::none()
                }
            }
        }
    } else {
        // Contracts with no notes still implement this function to avoid having special-casing, the implementation
        // simply throws immediately.
        quote {
            /// This contract does not use private notes, so this function should never be called as it will
            /// unconditionally fail.
            ///
            /// This function is automatically injected by the `#[aztec]` macro.
            #[contract_library_method]
            unconstrained fn _compute_note_hash_and_nullifier(
                _packed_note: BoundedVec<Field, aztec::messages::discovery::private_notes::MAX_NOTE_PACKED_LEN>,
                _storage_slot: Field,
                _note_type_id: Field,
                _contract_address: aztec::protocol_types::address::AztecAddress,
                _nonce: Field,
            ) -> Option<aztec::messages::discovery::NoteHashAndNullifier> {
                panic(f"This contract does not use private notes")
            }
        }
    }
}

comptime fn generate_note_exports() -> Quoted {
    let notes = NOTES.values();
    // Second value in each tuple is `note_packed_len` and that is ignored here because it's only used when
    // generating partial note helper functions.
    notes
        .map(|(s, _, note_type_id, fields): (TypeDefinition, u32, Field, [(Quoted, u32, bool)])| {
            generate_note_export(s, note_type_id, fields)
        })
        .join(quote {})
}

comptime fn generate_sync_private_state() -> Quoted {
    // We obtain the `utility` function on the next line instead of directly doing
    // `#[aztec::macros::functions::utility]` in the returned quote because the latter would result in the function
    // attribute having the full path in the ABI. This is undesirable because we use the information in the ABI only
    // to determine whether a function is `private`, `public`, or `utility`.
    let utility = crate::macros::functions::utility;

    // All we need to do here is trigger message discovery, but this is already done by the #[utility] macro - we don't
    // need to do anything extra.
    quote {
        #[$utility]
        unconstrained fn sync_private_state() {
        }
    }
}

comptime fn generate_process_message() -> Quoted {
    // We obtain the `utility` function on the next line instead of directly doing
    // `#[aztec::macros::functions::utility]` in the returned quote because the latter would result in the function
    // attribute having the full path in the ABI. This is undesirable because we use the information in the ABI only
    // to determine whether a function is `private`, `public`, or `utility`.
    let utility = crate::macros::functions::utility;

    quote {
        #[$utility]
        unconstrained fn process_message(
            message_ciphertext: BoundedVec<Field, aztec::protocol_types::constants::PRIVATE_LOG_CIPHERTEXT_LEN>,
            message_context: aztec::messages::processing::message_context::MessageContext,
        ) {
            aztec::messages::discovery::process_message::do_process_message(
                context.this_address(),
                _compute_note_hash_and_nullifier,
                message_ciphertext,
                message_context,
            );
        }
    }
}
