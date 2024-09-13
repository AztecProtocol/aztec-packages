mod functions;
mod utils;
mod notes;
mod storage;

use functions::STUBS;
use storage::STORAGE_LAYOUT_NAME;
use notes::{NOTES, generate_note_export};

use functions::transform_unconstrained;

pub comptime fn generate_contract_interface(m: Module) -> Quoted {
    let module_name = m.name();
    let fn_stubs_quote = STUBS.join(quote {});

    let has_storage = STORAGE_LAYOUT_NAME != quote {};
    let storage_layout_getter = if has_storage {
        quote {
            pub fn storage_layout() -> StorageLayout {
                $STORAGE_LAYOUT_NAME
            }
        }
    } else {
        quote {}
    };

    let library_storage_layout_getter = if has_storage {
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
    let body = if NOTES.len() == 0 {
        quote {
            assert(false, "This contract does not use private notes");
            [0, 0, 0, 0]
        }
    } else {
        max_note_length = NOTES.fold(0, | acc, (_, len, _): (StructDefinition, u32, Field) | {
            acc + len
        });
        let if_statements = NOTES.map(
            | (note, _, _): (StructDefinition, u32, Field) | {
                let note_name = note.name();
                quote {
                    if note_type_id == $note_name::get_note_type_id() {
                        aztec::note::utils::compute_note_hash_and_optionally_a_nullifier($note_name::deserialize_content, note_header, compute_nullifier, serialized_note)
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
    let note_exports = NOTES.map(
        | (s, _, note_type_id): (StructDefinition, u32, Field) | {
            generate_note_export(s, note_type_id)
        }
    ).join(quote {});

    quote {
        $note_exports
    }
}

pub comptime fn aztec(m: Module) -> Quoted {
    let interface = generate_contract_interface(m);
    let unconstrained_functions = m.functions().filter(| f: FunctionDefinition | f.is_unconstrained() & !f.has_named_attribute("test"));
    let compute_note_hash_and_optionally_a_nullifier = generate_compute_note_hash_and_optionally_a_nullifier();
    let note_exports = generate_note_exports();
    for f in unconstrained_functions {
        transform_unconstrained(f);
    }
    quote {
        $interface
        $compute_note_hash_and_optionally_a_nullifier
        $note_exports
    }
}
