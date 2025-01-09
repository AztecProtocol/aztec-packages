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
            target_contract: dep::aztec::protocol_types::address::AztecAddress
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
    let mut max_note_length: u32 = 0;
    let notes = NOTES.entries();
    let body = if notes.len() > 0 {
        max_note_length = notes.fold(
            0,
            |acc, (_, (_, len, _, _)): (Type, (StructDefinition, u32, Field, [(Quoted, u32, bool)]))| {
                acc + len
            },
        );

        let mut if_statements_list = &[];

        for i in 0..notes.len() {
            let (typ, (_, _, _, _)) = notes[i];
            let if_or_else_if = if i == 0 {
                quote { if }
            } else {
                quote { else if }
            };
            if_statements_list = if_statements_list.push_back(
                quote {
                $if_or_else_if note_type_id == $typ::get_note_type_id() {
                    aztec::note::utils::compute_note_hash_and_optionally_a_nullifier($typ::deserialize_content, note_header, compute_nullifier, serialized_note)
                }
            },
            );
        }

        let if_statements = if_statements_list.join(quote {});

        quote {
            let note_header = aztec::prelude::NoteHeader::new(contract_address, nonce, storage_slot);
            $if_statements
            else {
                panic(f"Unknown note type ID")
            }
        }
    } else {
        quote {
            panic(f"No notes defined")
        }
    };

    quote {
        unconstrained fn compute_note_hash_and_optionally_a_nullifier(
            contract_address: aztec::protocol_types::address::AztecAddress,
            nonce: Field,
            storage_slot: Field,
            note_type_id: Field,
            compute_nullifier: bool,
            serialized_note: [Field; $max_note_length],
        ) -> pub [Field; 4] {
            $body
        }
    }
}

comptime fn generate_process_log() -> Quoted {
    // This mandatory function processes a log emitted by the contract. This is currently used to recover note contents
    // and deliver the note to PXE.
    // The bulk of the work of this function is done by aztec::oracle::management::do_process_log, so all we need to do
    // is call that function. However, one of its parameters is a lambda function that computes note hash a nullifier
    // given note contents and metadata (e.g. note type id), given that this is behavior is contract-specific (as it
    // depends on the note types implemented by each contract).
    // The job of this macro is therefore to implement this lambda function and then call `do_process_log` with it.

    // A typical implementation of the lambda looks something like this:
    // ```
    // |serialized_note_content: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, note_header: NoteHeader, note_type_id: Field| {
    //     let hashes = if note_type_id == MyNoteType::get_note_type_id() {
    //         assert(serialized_note_content.len() == MY_NOTE_TYPE_SERIALIZATION_LENGTH);
    //         dep::aztec::note::utils::compute_note_hash_and_optionally_a_nullifier(
    //             MyNoteType::deserialize_content,
    //             note_header,
    //             true,
    //             serialized_note_content.storage(),
    //         )
    //     } else {
    //         panic(f"Unknown note type id {note_type_id}")
    //     };
    //
    //     Option::some(dep::aztec::oracle::management::NoteHashesAndNullifier {
    //         note_hash: hashes[0],
    //         unique_note_hash: hashes[1],
    //         inner_nullifier: hashes[3],
    //     })
    // }
    // ```
    //
    // We create this implementation by iterating over the different note types, creating an `if` or `else if` clause
    // for each of them and calling `compute_note_hash_and_optionally_a_nullifier` with the note's deserialization
    // function, and finally produce the required `NoteHashesAndNullifier` object.

    let notes = NOTES.entries();

    let mut if_note_type_id_match_statements_list = &[];
    for i in 0..notes.len() {
        let (typ, (_, serialized_note_length, _, _)) = notes[i];

        let if_or_else_if = if i == 0 {
            quote { if }
        } else {
            quote { else if }
        };

        if_note_type_id_match_statements_list = if_note_type_id_match_statements_list.push_back(
            quote {
                $if_or_else_if note_type_id == $typ::get_note_type_id() {
                    // As an extra safety check we make sure that the serialized_note_content bounded vec has the
                    // expected length, to avoid scenarios in which compute_note_hash_and_optionally_a_nullifier
                    // silently trims the end if the log were to be longer.
                    let expected_len = $serialized_note_length;
                    let actual_len = serialized_note_content.len();
                    assert(
                        actual_len == expected_len,
                        f"Expected note content of length {expected_len} but got {actual_len} for note type id {note_type_id}"
                    );

                    aztec::note::utils::compute_note_hash_and_optionally_a_nullifier($typ::deserialize_content, note_header, true, serialized_note_content.storage())
                }
            },
        );
    }

    let if_note_type_id_match_statements = if_note_type_id_match_statements_list.join(quote {});

    let body = if notes.len() > 0 {
        quote {
            // Because this unconstrained function is injected after the contract is processed by the macros, it'll not
            // be modified by the macros that alter unconstrained functions. As such, we need to manually inject the
            // unconstrained execution context since it will not be available otherwise.
            let context = dep::aztec::context::unconstrained_context::UnconstrainedContext::new();

            dep::aztec::oracle::management::do_process_log(
                context,
                log_plaintext,
                tx_hash,
                unique_note_hashes_in_tx,
                recipient,
                |serialized_note_content: BoundedVec<Field, _>, note_header, note_type_id| {
                    let hashes = $if_note_type_id_match_statements
                    else {
                        panic(f"Unknown note type id {note_type_id}")
                    };

                    Option::some(
                        dep::aztec::oracle::management::NoteHashesAndNullifier {
                            note_hash: hashes[0],
                            unique_note_hash: hashes[1],
                            inner_nullifier: hashes[3],
                        },
                    )
                }
            );
        }
    } else {
        panic(f"No notes defined")
    };

    quote {
        unconstrained fn process_log(
            log_plaintext: BoundedVec<Field, dep::aztec::protocol_types::constants::PRIVATE_LOG_SIZE_IN_FIELDS>,
            tx_hash: Field,
            unique_note_hashes_in_tx: BoundedVec<Field, dep::aztec::protocol_types::constants::MAX_NOTE_HASHES_PER_TX>,
            recipient: AztecAddress,
        ) {
            $body
        }
    }
}

comptime fn generate_note_exports() -> Quoted {
    let notes = NOTES.values();
    // Second value in each tuple is `note_serialized_len` and that is ignored here because it's only used when
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
