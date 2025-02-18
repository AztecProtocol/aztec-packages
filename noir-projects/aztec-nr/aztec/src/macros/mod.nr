pub mod dispatch;
pub mod functions;
pub mod utils;
pub mod notes;
pub mod storage;
pub mod events;

use functions::interfaces::STUBS;
use notes::{generate_note_export, NOTES};
use storage::STORAGE_LAYOUT_NAME;

use dispatch::generate_public_dispatch;
use functions::transform_unconstrained;
use utils::module_has_storage;

global NOTE_INTERFACE: TraitConstraint =
    quote { crate::note::note_interface::NoteInterface }.as_trait_constraint();

/// Marks a contract as an Aztec contract, generating the interfaces for its functions and notes, as well as injecting
/// the `compute_note_hash_and_optionally_a_nullifier` function PXE requires in order to validate notes.
///
/// Note: This is a module annotation, so the returned quote gets injected inside the module (contract) itself.
pub comptime fn aztec(m: Module) -> Quoted {
    let interface = generate_contract_interface(m);
    let unconstrained_functions = m.functions().filter(|f: FunctionDefinition| {
        f.is_unconstrained() & !f.has_named_attribute("test") & !f.has_named_attribute("public")
    });
    for f in unconstrained_functions {
        transform_unconstrained(f);
    }

    let compute_note_hash_and_optionally_a_nullifier =
        generate_compute_note_hash_and_optionally_a_nullifier();
    let process_logs = generate_process_log();
    let note_exports = generate_note_exports();
    let public_dispatch = generate_public_dispatch(m);
    let sync_notes = generate_sync_notes();

    quote {
        $note_exports
        $interface
        $compute_note_hash_and_optionally_a_nullifier
        $process_logs
        $public_dispatch
        $sync_notes
    }
}

comptime fn generate_contract_interface(m: Module) -> Quoted {
    let module_name = m.name();
    let contract_stubs = STUBS.get(m);
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

comptime fn generate_compute_note_hash_and_optionally_a_nullifier() -> Quoted {
    let mut max_note_packed_len: u32 = 0;
    let notes = NOTES.entries();
    if notes.len() > 0 {
        max_note_packed_len = notes.fold(
            0,
            |acc, (_, (_, len, _, _)): (Type, (StructDefinition, u32, Field, [(Quoted, u32, bool)]))| {
                if len > acc {
                    len
                } else {
                    acc
                }
            },
        );

        let mut if_statements_list = &[];

        for i in 0..notes.len() {
            let (typ, (_, _, _, _)) = notes[i];

            // We get the typed expressions of `get_note_type_id` and `unpack` here rather than directly inlining them
            // in the quote with `$typ::get_note_type_id()` and `$typ::unpack()`. Direct inlining would result
            // in missing import warnings in the generated code (specifically, warnings that NoteInterface and
            // Packable<N> are implemented but not in scope).
            // Note: noir-fmt:ignore is used to avoid the following formatter bug:
            // https://github.com/noir-lang/noir/issues/7407
            // noir-fmt:ignore
            let get_note_type_id = typ.get_trait_impl(NOTE_INTERFACE).unwrap().methods().filter(
                |m| m.name() == quote { get_note_type_id },
            )[0]
                .as_typed_expr();

            // We obtain the packable trait constraint here rather than storing it as a global variable. This is because
            // the trait has a generic parameter that gets matched on first use. If we used a global variable, we would
            // fail to get trait implementations for types that don't match the already-matched generic parameter.
            let packable: TraitConstraint =
                quote { crate::protocol_types::traits::Packable<_> }.as_trait_constraint();

            let unpack = typ.get_trait_impl(packable).unwrap().methods().filter(|m| {
                m.name() == quote { unpack }
            })[0]
                .as_typed_expr();

            let if_or_else_if = if i == 0 {
                quote { if }
            } else {
                quote { else if }
            };
            if_statements_list = if_statements_list.push_back(
                quote {
                $if_or_else_if note_type_id == $get_note_type_id() {
                    aztec::note::utils::compute_note_hash_and_optionally_a_nullifier($unpack, contract_address, nonce, compute_nullifier, storage_slot, packed_note)
                }
            },
            );
        }

        let if_statements = if_statements_list.join(quote {});

        quote {
            unconstrained fn compute_note_hash_and_optionally_a_nullifier(
                contract_address: aztec::protocol_types::address::AztecAddress,
                nonce: Field,
                storage_slot: Field,
                note_type_id: Field,
                compute_nullifier: bool,
                packed_note: [Field; $max_note_packed_len],
            ) -> pub [Field; 4] {
                $if_statements
                else {
                    panic(f"Unknown note type ID: {note_type_id}")
                }
            }
        }
    } else {
        quote {
            unconstrained fn compute_note_hash_and_optionally_a_nullifier(
                _contract_address: aztec::protocol_types::address::AztecAddress,
                _nonce: Field,
                _storage_slot: Field,
                _note_type_id: Field,
                _compute_nullifier: bool,
                _packed_note: [Field; $max_note_packed_len],
            ) -> pub [Field; 4] {
                panic(f"No notes defined")
            }
        }
    }
}

comptime fn generate_process_log() -> Quoted {
    // This mandatory function processes a log emitted by the contract. This is currently used to recover a note and
    // deliver it to PXE.
    // The bulk of the work of this function is done by aztec::note::discovery::do_process_log, so all we need to do
    // is call that function. However, one of its parameters is a lambda function that computes note hash and nullifier
    // given packed note and metadata (e.g. note type id), since this behavior is contract-specific (as it
    // depends on the note types implemented by each contract).
    // The job of this macro is therefore to implement this lambda function and then call `do_process_log` with it.

    // A typical implementation of the lambda looks something like this:
    // ```
    // |packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>, contract_address: AztecAddress, nonce: Field, storage_slot: Field, note_type_id: Field| {
    //     let hashes = if note_type_id == MyNoteType::get_note_type_id() {
    //         assert(packed_note.len() == MY_NOTE_TYPE_PACKED_LENGTH);
    //         dep::aztec::note::utils::compute_note_hash_and_optionally_a_nullifier(
    //             MyNoteType::unpack,
    //             contract_address,
    //             nonce,
    //             true,
    //             storage_slot,
    //             packed_note.storage(),
    //         )
    //     } else {
    //         panic(f"Unknown note type id {note_type_id}")
    //     };
    //
    //     Option::some(dep::aztec::note::discovery::NoteHashesAndNullifier {
    //         note_hash: hashes[0],
    //         unique_note_hash: hashes[1],
    //         inner_nullifier: hashes[3],
    //     })
    // }
    // ```
    //
    // We create this implementation by iterating over the different note types, creating an `if` or `else if` clause
    // for each of them and calling `compute_note_hash_and_optionally_a_nullifier` with the note's `unpack` function,
    // and finally produce the required `NoteHashesAndNullifier` object.

    let notes = NOTES.entries();

    let mut if_note_type_id_match_statements_list = &[];
    for i in 0..notes.len() {
        let (typ, (_, packed_note_length, _, _)) = notes[i];

        // We get the typed expressions of `get_note_type_id` and `unpack` here rather than directly inlining them
        // in the quote with `$typ::get_note_type_id()` and `$typ::unpack()`. Direct inlining would result
        // in missing import warnings in the generated code (specifically, warnings that NoteInterface and
        // Packable<N> are implemented but not in scope).
        let get_note_type_id = typ.get_trait_impl(NOTE_INTERFACE).unwrap().methods().filter(|m| {
            m.name() == quote { get_note_type_id }
        })[0]
            .as_typed_expr();

        // We obtain the packable trait constraint here rather than storing it as a global variable. This is because
        // the trait has a generic parameter that gets matched on first use. If we used a global variable, we would
        // fail to get trait implementations for types that don't match the already-matched generic parameter.
        let packable: TraitConstraint =
            quote { crate::protocol_types::traits::Packable<_> }.as_trait_constraint();

        let unpack = typ.get_trait_impl(packable).unwrap().methods().filter(|m| {
            m.name() == quote { unpack }
        })[0]
            .as_typed_expr();

        let if_or_else_if = if i == 0 {
            quote { if }
        } else {
            quote { else if }
        };

        if_note_type_id_match_statements_list = if_note_type_id_match_statements_list.push_back(
            quote {
                $if_or_else_if note_type_id == $get_note_type_id() {
                    // As an extra safety check we make sure that the packed_note bounded vec has the
                    // expected length, to avoid scenarios in which compute_note_hash_and_optionally_a_nullifier
                    // silently trims the end if the log were to be longer.
                    let expected_len = $packed_note_length;
                    let actual_len = packed_note.len();
                    assert(
                        actual_len == expected_len,
                        f"Expected packed note of length {expected_len} but got {actual_len} for note type id {note_type_id}"
                    );

                    aztec::note::utils::compute_note_hash_and_optionally_a_nullifier($unpack, contract_address, nonce, true, storage_slot, packed_note.storage())
                }
            },
        );
    }

    let if_note_type_id_match_statements = if_note_type_id_match_statements_list.join(quote {});

    if notes.len() > 0 {
        quote {
            unconstrained fn process_log(
                log_plaintext: BoundedVec<Field, dep::aztec::protocol_types::constants::PRIVATE_LOG_SIZE_IN_FIELDS>,
                tx_hash: Field,
                unique_note_hashes_in_tx: BoundedVec<Field, dep::aztec::protocol_types::constants::MAX_NOTE_HASHES_PER_TX>,
                first_nullifier_in_tx: Field,
                recipient: aztec::protocol_types::address::AztecAddress,
            ) {
                // Because this unconstrained function is injected after the contract is processed by the macros, it'll not
                // be modified by the macros that alter unconstrained functions. As such, we need to manually inject the
                // unconstrained execution context since it will not be available otherwise.
                let context = dep::aztec::context::unconstrained_context::UnconstrainedContext::new();

                dep::aztec::note::discovery::do_process_log(
                    context,
                    log_plaintext,
                    tx_hash,
                    unique_note_hashes_in_tx,
                    first_nullifier_in_tx,
                    recipient,
                    |packed_note: BoundedVec<Field, _>, contract_address, nonce, storage_slot, note_type_id| {
                        let hashes = $if_note_type_id_match_statements
                        else {
                            panic(f"Unknown note type id {note_type_id}")
                        };

                        Option::some(
                            dep::aztec::note::discovery::NoteHashesAndNullifier {
                                note_hash: hashes[0],
                                unique_note_hash: hashes[1],
                                inner_nullifier: hashes[3],
                            },
                        )
                    }
                );
            }
        }
    } else {
        quote {
            unconstrained fn process_log(
                _log_plaintext: BoundedVec<Field, dep::aztec::protocol_types::constants::PRIVATE_LOG_SIZE_IN_FIELDS>,
                _tx_hash: Field,
                _unique_note_hashes_in_tx: BoundedVec<Field, dep::aztec::protocol_types::constants::MAX_NOTE_HASHES_PER_TX>,
                _first_nullifier_in_tx: Field,
                _recipient: aztec::protocol_types::address::AztecAddress,
            ) {
                panic(f"No notes defined")
            }
        }
    }
}

comptime fn generate_note_exports() -> Quoted {
    let notes = NOTES.values();
    // Second value in each tuple is `note_packed_len` and that is ignored here because it's only used when
    // generating the `compute_note_hash_and_optionally_a_nullifier` function.
    notes
        .map(|(s, _, note_type_id, fields): (StructDefinition, u32, Field, [(Quoted, u32, bool)])| {
            generate_note_export(s, note_type_id, fields)
        })
        .join(quote {})
}

comptime fn generate_sync_notes() -> Quoted {
    quote {
        unconstrained fn sync_notes() {
            aztec::oracle::notes::sync_notes();
        }
    }
}
