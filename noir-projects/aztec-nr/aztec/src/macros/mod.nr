pub mod dispatch;
pub mod functions;
pub mod utils;
pub mod notes;
pub mod storage;
pub mod events;

use functions::{stub_registry, utils::transform_unconstrained};
use notes::{generate_note_export, NOTES};
use storage::STORAGE_LAYOUT_NAME;

use dispatch::generate_public_dispatch;
use utils::{get_trait_impl_method, module_has_storage};

use crate::discovery::MAX_NOTE_PACKED_LEN;

/// Marks a contract as an Aztec contract, generating the interfaces for its functions and notes, as well as injecting
/// the `compute_note_hash_and_optionally_a_nullifier` function PXE requires in order to validate notes.
/// Note: This is a module annotation, so the returned quote gets injected inside the module (contract) itself.
pub comptime fn aztec(m: Module) -> Quoted {
    let interface = generate_contract_interface(m);
    let unconstrained_functions = m.functions().filter(|f: FunctionDefinition| {
        f.is_unconstrained() & !f.has_named_attribute("test") & !f.has_named_attribute("public")
    });
    for f in unconstrained_functions {
        transform_unconstrained(f);
    }

    let contract_library_method_compute_note_hash_and_optionally_a_nullifier =
        generate_contract_library_method_compute_note_hash_and_optionally_a_nullifier();
    let compute_note_hash_and_optionally_a_nullifier =
        generate_compute_note_hash_and_optionally_a_nullifier();
    let process_log = generate_process_log();
    let note_exports = generate_note_exports();
    let public_dispatch = generate_public_dispatch(m);
    let sync_notes = generate_sync_notes();

    quote {
        $note_exports
        $interface
        $contract_library_method_compute_note_hash_and_optionally_a_nullifier
        $compute_note_hash_and_optionally_a_nullifier
        $process_log
        $public_dispatch
        $sync_notes
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

/// Generates a contract library method called `_compute_note_hash_and_optionally_a_nullifier` which is used for note
/// discovery (to create the `aztec::discovery::ComputeNoteHashAndNullifier` function) and to implement the
/// `compute_note_hash_and_nullifier` unconstrained contract function.
comptime fn generate_contract_library_method_compute_note_hash_and_optionally_a_nullifier() -> Quoted {
    let notes = NOTES.entries();

    let mut max_note_packed_len: u32 = 0;
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

        if max_note_packed_len > MAX_NOTE_PACKED_LEN {
            panic(
                f"One of the notes has packed len {max_note_packed_len} but the maximum is {MAX_NOTE_PACKED_LEN}",
            );
        }

        // Contracts that do define notes produce an if-else chain where `note_type_id` is matched against the
        // `get_note_type_id()` function of each note type that we know of, in order to identify the note type. Once we
        // know it we call `aztec::note::utils::compute_note_hash_and_optionally_a_nullifier` (which is the one that
        // actually does the work) with the correct `unpack()` function.

        let mut if_note_type_id_match_statements_list = &[];
        for i in 0..notes.len() {
            let (typ, (_, packed_note_length, _, _)) = notes[i];

            let get_note_type_id = get_trait_impl_method(
                typ,
                quote { crate::note::note_interface::NoteInterface },
                quote { get_note_type_id },
            );
            let unpack = get_trait_impl_method(
                typ,
                quote { crate::protocol_types::traits::Packable<_> },
                quote { unpack },
            );

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

                        aztec::note::utils::compute_note_hash_and_optionally_a_nullifier($unpack, contract_address, nonce, storage_slot, compute_nullifier, packed_note.storage())
                    }
                },
            );
        }

        let if_note_type_id_match_statements = if_note_type_id_match_statements_list.join(quote {});

        quote {
            #[contract_library_method]
            unconstrained fn _compute_note_hash_and_optionally_a_nullifier(
                contract_address: aztec::protocol_types::address::AztecAddress,
                nonce: Field,
                storage_slot: Field,
                note_type_id: Field,
                compute_nullifier: bool,
                packed_note: BoundedVec<Field, aztec::discovery::MAX_NOTE_PACKED_LEN>,
            ) -> pub [Field; 4] {
                $if_note_type_id_match_statements
                else {
                    panic(f"Unknown note type ID")
                }
            }
        }
    } else {
        // Contracts with no notes still implement this function to avoid having special-casing, the implementation
        // simply throws immediately.
        quote {
            #[contract_library_method]
            unconstrained fn _compute_note_hash_and_optionally_a_nullifier(
                _contract_address: aztec::protocol_types::address::AztecAddress,
                _nonce: Field,
                _storage_slot: Field,
                _note_type_id: Field,
                _compute_nullifier: bool,
                _packed_note: BoundedVec<Field, aztec::discovery::MAX_NOTE_PACKED_LEN>,
            ) -> pub [Field; 4] {
                panic(f"This contract does not use private notes")
            }
        }
    }
}

comptime fn generate_compute_note_hash_and_optionally_a_nullifier() -> Quoted {
    // For historical reasons we keep this function returning four fields (even though the caller should likely perform
    // note hash siloing on their own and not trust this). The contract library method `_compute_note_hash...` is
    // affected by this.
    // TODO(#11638): In the future we might remove these things as we rely less and less on this function, and then
    // change the `_compute_note_hash...` contract library method to be of type
    // `aztec::discovery::ComputeNoteHashAndNullifier`, simplifying other macros by removing the need to create
    // intermediate lambdas that adapt their interfaces.

    if NOTES.entries().len() > 0 {
        quote {
            unconstrained fn compute_note_hash_and_optionally_a_nullifier(
                contract_address: aztec::protocol_types::address::AztecAddress,
                nonce: Field,
                storage_slot: Field,
                note_type_id: Field,
                compute_nullifier: bool,
                packed_note: BoundedVec<Field, aztec::discovery::MAX_NOTE_PACKED_LEN>,
            ) -> pub [Field; 4] {
                _compute_note_hash_and_optionally_a_nullifier(contract_address, nonce, storage_slot, note_type_id, compute_nullifier, packed_note)
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
                _packed_note: BoundedVec<Field, aztec::discovery::MAX_NOTE_PACKED_LEN>,
            ) -> pub [Field; 4] {
                panic(f"No notes defined")
            }
        }
    }
}

comptime fn generate_process_log() -> Quoted {
    // This mandatory function processes a log emitted by the contract. This is currently used to process private logs
    // and perform note discovery of either private notes or partial notes.
    // The bulk of the work of this function is done by aztec::discovery::do_process_log, so all we need to do is call
    // that function. We use the contract library method injected by
    // `generate_contract_library_method_compute_note_hash_and_optionally_a_nullifier` in order to create the required
    // `aztec::discovery::ComputeNoteHashAndNullifier` function.

    // We'll produce the entire body of the function in one go and then insert it into the function.
    let notes = NOTES.entries();

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

                // TODO(#10727): allow other contracts to process logs and deliver notes
                let contract_address = context.this_address();

                aztec::discovery::private_logs::do_process_log(
                    contract_address,
                    log_plaintext,
                    tx_hash,
                    unique_note_hashes_in_tx,
                    first_nullifier_in_tx,
                    recipient,
                    |packed_note_content: BoundedVec<Field, _>, contract_address: aztec::protocol_types::address::AztecAddress, nonce: Field, storage_slot: Field, note_type_id: Field| {
                        let hashes = _compute_note_hash_and_optionally_a_nullifier(contract_address, nonce, storage_slot, note_type_id, true, packed_note_content);

                        Option::some(
                            aztec::discovery::NoteHashAndNullifier {
                                note_hash: hashes[0],
                                inner_nullifier: hashes[3],
                            },
                        )
                    }
                );
            }
        }
    } else {
        // Contracts with no notes still implement this function to avoid having special-casing, the implementation
        // simply throws immediately.
        quote {
            unconstrained fn process_log(
                _log_plaintext: BoundedVec<Field, dep::aztec::protocol_types::constants::PRIVATE_LOG_SIZE_IN_FIELDS>,
                _tx_hash: Field,
                _unique_note_hashes_in_tx: BoundedVec<Field, dep::aztec::protocol_types::constants::MAX_NOTE_HASHES_PER_TX>,
                _first_nullifier_in_tx: Field,
                _recipient: aztec::protocol_types::address::AztecAddress,
            ) {
                panic(f"This contract does not use private notes")
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
            aztec::oracle::note_discovery::sync_notes();
        }
    }
}
