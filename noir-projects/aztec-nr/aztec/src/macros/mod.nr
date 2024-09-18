mod functions;
mod utils;
mod notes;
mod storage;
mod events;

use functions::interfaces::STUBS;
use storage::STORAGE_LAYOUT_NAME;
use notes::{NOTES, generate_note_export};

use functions::transform_unconstrained;
use utils::module_has_storage;

pub comptime fn generate_contract_interface(m: Module) -> Quoted {
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
            pub fn storage_layout() -> StorageLayout {
                $storage_layout_name
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
        struct $module_name {
            target_contract: dep::aztec::protocol_types::address::AztecAddress
        }

        impl $module_name {
            $fn_stubs_quote

            pub fn at(
                target_contract: aztec::protocol_types::address::AztecAddress
            ) -> Self {
                Self { target_contract }
            }

            pub fn interface() -> Self {
                Self { target_contract: aztec::protocol_types::address::AztecAddress::zero() }
            }

            $storage_layout_getter
        }

        #[contract_library_method]
        pub fn at(
            target_contract: aztec::protocol_types::address::AztecAddress
        ) -> $module_name {
            $module_name { target_contract }
        }

        #[contract_library_method]
        pub fn interface() -> $module_name {
            $module_name { target_contract: aztec::protocol_types::address::AztecAddress::zero() }
        }

        $library_storage_layout_getter

    }
}

pub comptime fn generate_compute_note_hash_and_optionally_a_nullifier() -> Quoted {
    let mut max_note_length: u32 = 0;
    let notes = NOTES.entries();
    let body = if notes.len() > 0 {
        max_note_length = notes.fold(0, | acc, (_, (_, len, _)): (Type, (StructDefinition, u32, Field)) | {
            acc + len
        });

        let if_statements = notes.map(
            | (typ, (note, _, _)): (Type, (StructDefinition, u32, Field)) | {
                quote {
                    if note_type_id == $typ::get_note_type_id() {
                        aztec::note::utils::compute_note_hash_and_optionally_a_nullifier($typ::deserialize_content, note_header, compute_nullifier, serialized_note)
                    }
                }
        }
        ).join(quote{});

        quote {
            let note_header = aztec::prelude::NoteHeader::new(contract_address, nonce, storage_slot);
            $if_statements
            else {
                assert(false, "Unknown note type ID");
                [0, 0, 0, 0]
            }
        }
    } else {
        quote {
            assert(false, "No notes defined");
            [0, 0, 0, 0]
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

pub comptime fn generate_note_exports() -> Quoted {
    let notes = NOTES.values();
    notes.map(
        | (s, _, note_type_id): (StructDefinition, u32, Field) | {
            generate_note_export(s, note_type_id)
        }
    ).join(quote {})
}

pub comptime fn aztec(m: Module) -> Quoted {
    let interface = generate_contract_interface(m);

    let unconstrained_functions = m.functions().filter(
        | f: FunctionDefinition | f.is_unconstrained() & !f.has_named_attribute("test") & !f.has_named_attribute("public")
    );
    for f in unconstrained_functions {
        transform_unconstrained(f);
    }

    //let compute_note_hash_and_optionally_a_nullifier = generate_compute_note_hash_and_optionally_a_nullifier();
    let note_exports = generate_note_exports();

    quote {
        $note_exports
        $interface
        //$compute_note_hash_and_optionally_a_nullifier
    }
}
