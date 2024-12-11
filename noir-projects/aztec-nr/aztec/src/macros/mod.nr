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
    let note_exports = generate_note_exports();
    let public_dispatch = generate_public_dispatch(m);
    let sync_notes = generate_sync_notes();
    quote {
        $note_exports
        $interface
        $compute_note_hash_and_optionally_a_nullifier
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
