use crate::{macros::utils::AsStrQuote, note::note_getter_options::PropertySelector};
use poseidon::poseidon2::Poseidon2Hasher;
use protocol_types::meta::{derive_packable_and_get_packed_len, generate_serialize_to_fields};
use std::{
    collections::umap::UHashMap,
    hash::{BuildHasherDefault, Hash, Hasher},
    meta::{type_of, unquote},
};

/// A map from note type to (note_struct_definition, note_packed_len, note_type_id, fields).
/// `fields` is an array of tuples where each tuple contains the name of the field/struct member (e.g. `amount`
/// in `TokenNote`), the index of where the packed member starts in the packed note and a flag indicating
/// whether the field is nullable or not.
pub comptime mut global NOTES: UHashMap<Type, (TypeDefinition, u32, Field, [(Quoted, u32, bool)]), BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

pub comptime mut global NOTE_TYPE_ID_COUNTER: u32 = 0;

/// The note type id is set by enumerating the note types.
comptime fn get_next_note_type_id() -> Field {
    // We assert that the note type id fits within 7 bits
    assert(
        NOTE_TYPE_ID_COUNTER < 128 as u32,
        "A contract can contain at most 128 different note types",
    );

    let note_type_id = NOTE_TYPE_ID_COUNTER as Field;
    NOTE_TYPE_ID_COUNTER += 1;
    note_type_id
}

/// Generates a quote that implements `Packable` for a given struct `s`.
/// If the note struct already implements `Packable`, we return an empty quote.
comptime fn derive_packable_if_not_implemented_and_get_len(s: TypeDefinition) -> (Quoted, u32) {
    // We try to get the packed length of the note struct. If it does not implement `Packable`, we get Option::none()
    let packed_len_typ = std::meta::typ::fresh_type_variable();
    // We don't care about the result of the implements check. We just want the get the packed length.
    let _ = s.as_type().implements(
        quote { crate::protocol_types::traits::Packable<$packed_len_typ> }.as_trait_constraint(),
    );
    let maybe_packed_length = packed_len_typ.as_constant();

    if maybe_packed_length.is_some() {
        // We got some packed length meaning that the note struct implements `Packable`. For this reason we return
        // an empty quote for the implementation and the packed length.
        (quote {}, maybe_packed_length.unwrap())
    } else {
        // We didn't manage to get the packed length which means the note struct doesn't implement `Packable`
        // so we derive it and return it along with the packed length.
        derive_packable_and_get_packed_len(s)
    }
}

/// Generates default `NoteType` implementation for a given note struct `s` and returns it as a quote.
///
/// impl NoteType for NoteStruct {
///     fn get_id() -> Field {
///         ...
///     }
/// }
comptime fn generate_note_interface(s: TypeDefinition, note_type_id: Field) -> Quoted {
    let name = s.name();

    quote {
        impl aztec::note::note_interface::NoteType for $name {
            fn get_id() -> Field {
                $note_type_id
            }
        }
    }
}

/// Generates default `NoteHash` trait implementation for a given note struct `s` and returns it as a quote.
///
/// # Generated Implementation
/// ```
/// impl NoteHash for NoteStruct {
///     fn compute_note_hash(self, storage_slot: Field) -> Field { ... }
///
///     fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field { ... }
///
///     unconstrained fn compute_nullifier_unconstrained(note_hash_for_nullify: Field) -> Field { ... }
/// }
/// ```
comptime fn generate_note_hash_trait_impl(s: TypeDefinition) -> Quoted {
    let name = s.name();

    quote {
        impl aztec::note::note_interface::NoteHash for $name {
            fn compute_note_hash(self, storage_slot: Field) -> Field {
                let inputs = aztec::protocol_types::traits::Packable::pack(self).concat( [storage_slot]);
                aztec::protocol_types::hash::poseidon2_hash_with_separator(inputs, aztec::protocol_types::constants::GENERATOR_INDEX__NOTE_HASH)
            }

            fn compute_nullifier(
                self,
                context: &mut aztec::context::PrivateContext,
                note_hash_for_nullify: Field,
            ) -> Field {
                let owner_npk_m = aztec::keys::getters::get_public_keys(self.owner).npk_m;
                // We invoke hash as a static trait function rather than calling owner_npk_m.hash() directly
                // in the quote to avoid "trait not in scope" compiler warnings.
                let owner_npk_m_hash = aztec::protocol_types::traits::Hash::hash(owner_npk_m);
                let secret = context.request_nsk_app(owner_npk_m_hash);
                aztec::protocol_types::hash::poseidon2_hash_with_separator(
                    [note_hash_for_nullify, secret],
                    aztec::protocol_types::constants::GENERATOR_INDEX__NOTE_NULLIFIER as Field,
                )
            }

            unconstrained fn compute_nullifier_unconstrained(
                self,
                note_hash_for_nullify: Field,
            ) -> Field {
                let owner_npk_m = aztec::keys::getters::get_public_keys(self.owner).npk_m;
                // We invoke hash as a static trait function rather than calling owner_npk_m.hash() directly
                // in the quote to avoid "trait not in scope" compiler warnings.
                let owner_npk_m_hash = aztec::protocol_types::traits::Hash::hash(owner_npk_m);
                let secret = aztec::keys::getters::get_nsk_app(owner_npk_m_hash);
                aztec::protocol_types::hash::poseidon2_hash_with_separator(
                    [note_hash_for_nullify, secret],
                    aztec::protocol_types::constants::GENERATOR_INDEX__NOTE_NULLIFIER as Field,
                )
            }
        }
    }
}

/// Generates note properties struct for a given note struct `s`.
///
/// Example:
/// ```
/// struct TokenNoteProperties {
///     amount: aztec::note::note_getter_options::PropertySelector,
///     npk_m_hash: aztec::note::note_getter_options::PropertySelector
///     randomness: aztec::note::note_getter_options::PropertySelector
/// }
///
/// impl aztec::note::note_interface::NoteProperties<TokenNoteProperties> for TokenNote {
///     fn properties() -> TokenNoteProperties {
///         Self {
///             amount: aztec::note::note_getter_options::PropertySelector { index: 0, offset: 0, length: 32 },
///             npk_m_hash: aztec::note::note_getter_options::PropertySelector { index: 1, offset: 0, length: 32 },
///             randomness: aztec::note::note_getter_options::PropertySelector { index: 2, offset: 0, length: 32 }
///         }
///     }
/// }
/// ```
comptime fn generate_note_properties(s: TypeDefinition) -> Quoted {
    let name = s.name();

    let struct_name = f"{name}Properties".quoted_contents();

    let property_selector_type = type_of(PropertySelector { index: 0, offset: 0, length: 0 });

    let note_fields = s.fields_as_written();

    let properties_types = note_fields
        .map(|(name, _, _)| quote { pub $name: $property_selector_type })
        .join(quote {,});

    // TODO #8694: Properly handle non-field types https://github.com/AztecProtocol/aztec-packages/issues/8694
    let mut properties_list = &[];
    for i in 0..note_fields.len() {
        let (name, _, _) = note_fields[i];
        properties_list = properties_list.push_back(
            quote { $name: aztec::note::note_getter_options::PropertySelector { index: $i, offset: 0, length: 32 } },
        );
    }

    let properties = properties_list.join(quote {,});

    quote {
        pub struct $struct_name {
            $properties_types
        }

        impl aztec::note::note_interface::NoteProperties<$struct_name> for $name {
            fn properties() -> $struct_name {
                $struct_name {
                    $properties
                }
            }
        }
    }
}

/// Generates note export for a given note struct `s`. The export is a global variable that contains note type id,
/// note name and information about note fields (field name, index and whether the field is nullable or not).
///
/// Example:
/// ```
/// struct TokenNoteFields_5695262104 {
///     amount: aztec::note::note_field::NoteField,
///     owner: aztec::note::note_field::NoteField
/// }
///
/// #[abi(notes)]
/// global TokenNote_EXPORTS_5695262104: (Field, str<8>, TokenNoteFields_5695262104) = (
///     0,
///     "TokenNote",
///     TokenNoteFields_5695262104 {
///         amount: aztec::note::note_field::NoteField { index: 0, nullable: false },
///         owner: aztec::note::note_field::NoteField { index: 1, nullable: false }
///     }
/// );
///
/// Randomly looking value at the end of the export name is generated by hashing the note struct type and is included
/// to prevent naming collisions in case there are multiple notes with the same name imported in a contract.
pub(crate) comptime fn generate_note_export(
    s: TypeDefinition,
    note_type_id: Field,
    fields: [(Quoted, u32, bool)],
) -> Quoted {
    let name = s.name();
    let mut hasher = Poseidon2Hasher::default();
    s.as_type().hash(&mut hasher);
    let hash = hasher.finish() as u32;
    let global_export_name = f"{name}_EXPORTS_{hash}".quoted_contents();
    let note_fields_name = f"{name}Fields_{hash}".quoted_contents();
    let (note_name_as_str, _) = name.as_str_quote();
    let note_name_str_len = unquote!(quote { $note_name_as_str.as_bytes().len() });

    let mut note_fields = &[];
    let mut note_field_constructors = &[];
    for field in fields {
        let (name, index, nullable) = field;
        note_fields = note_fields.push_back(quote { $name: aztec::note::note_field::NoteField });
        note_field_constructors = note_field_constructors.push_back(
            quote { $name: aztec::note::note_field::NoteField { index: $index, nullable: $nullable }},
        );
    }

    let note_fields = note_fields.join(quote {,});
    let note_field_constructors = note_field_constructors.join(quote {,});

    quote {
        pub struct $note_fields_name {
            pub $note_fields
        }

        #[abi(notes)]
        global $global_export_name: (Field, str<$note_name_str_len>, $note_fields_name) = ($note_type_id, $note_name_as_str, $note_fields_name { $note_field_constructors });
    }
}

/// Registers a note struct `note` with the given `note_packed_len`, `note_type_id`, `fixed_fields` and
/// `nullable_fields` in the global `NOTES` map.
comptime fn register_note(
    note: TypeDefinition,
    note_packed_len: u32,
    note_type_id: Field,
    fixed_fields: [(Quoted, Type, u32)],
    nullable_fields: [(Quoted, Type, u32)],
) {
    let mut fields = &[];
    for field in fixed_fields {
        let (name, _, index) = field;
        fields = fields.push_back((name, index, false));
    }
    for field in nullable_fields {
        let (name, _, index) = field;
        fields = fields.push_back((name, index, true));
    }

    NOTES.insert(note.as_type(), (note, note_packed_len, note_type_id, fields));
}

/// Separates note struct members into fixed and nullable ones. It also stores the index of where each struct member
/// starts in the serialized note. Note that each struct member can occupy multiple fields (as in Field type).
comptime fn index_note_fields(
    s: TypeDefinition,
    nullable_fields: [Quoted],
) -> ([(Quoted, Type, u32)], [(Quoted, Type, u32)]) {
    let mut indexed_fixed_fields: [(Quoted, Type, u32)] = &[];
    let mut indexed_nullable_fields = &[];
    let mut counter: u32 = 0;
    for field in s.fields_as_written() {
        let (name, typ, _) = field;
        if nullable_fields.all(|field| field != name) {
            indexed_fixed_fields = indexed_fixed_fields.push_back((name, typ, counter));
        } else {
            indexed_nullable_fields = indexed_nullable_fields.push_back((name, typ, counter));
        }
        let (serialization_fields, _) = generate_serialize_to_fields(name, typ, true);
        // Each struct member can occupy multiple fields so we need to increment the counter accordingly
        counter += serialization_fields.len();
    }
    (indexed_fixed_fields, indexed_nullable_fields)
}

/// Generates the following:
/// - NoteTypeProperties
/// - NoteType trait implementation
/// - NoteHash trait implementation
/// - Packable implementation
///
/// Registers the note in the global `NOTES` map.
///
/// For more details on the generated code, see the individual functions.
pub comptime fn note(s: TypeDefinition) -> Quoted {
    assert_has_owner(s);

    let (indexed_fixed_fields, indexed_nullable_fields) = index_note_fields(s, &[]);

    let note_properties = generate_note_properties(s);
    let note_type_id = get_next_note_type_id();
    let note_interface_impl = generate_note_interface(s, note_type_id);
    let note_hash_impl = generate_note_hash_trait_impl(s);
    let (packable_impl, note_packed_len) = derive_packable_if_not_implemented_and_get_len(s);

    register_note(
        s,
        note_packed_len,
        note_type_id,
        indexed_fixed_fields,
        indexed_nullable_fields,
    );

    quote {
        $note_properties
        $note_interface_impl
        $note_hash_impl
        $packable_impl
    }
}

/// Generates code for a custom note implementation that requires specialized note hash or nullifier computation.
///
/// # Generated Code
/// - NoteTypeProperties: Defines the structure and properties of note fields
/// - NoteType trait implementation: Provides the note type ID
/// - Packable implementation: Enables serialization/deserialization of the note
///
/// # Registration
/// Registers the note in the global `NOTES` map with:
/// - Note type ID
/// - Packed length
/// - Field indices and nullability
///
/// # Use Cases
/// Use this macro when implementing a note that needs custom:
/// - Note hash computation logic
/// - Nullifier computation logic
///
/// The macro omits generating default NoteHash trait implementation, allowing you to provide your own.
///
/// # Example
/// ```
/// #[custom_note]
/// struct CustomNote {
///     value: Field,
///     metadata: Field
/// }
///
/// impl NoteHash for CustomNote {
///     // Custom note hash computation...
///     fn compute_note_hash(...) -> Field { ... }
///
///     // Custom nullifier computation...
///     fn compute_nullifier(...) -> Field { ... }
///     fn compute_nullifier_unconstrained(...) -> Field { ... }
/// }
/// ```
pub comptime fn custom_note(s: TypeDefinition) -> Quoted {
    let (packable_impl, note_packed_len) = derive_packable_if_not_implemented_and_get_len(s);
    let note_type_id = get_next_note_type_id();

    let (indexed_fixed_fields, indexed_nullable_fields) = index_note_fields(s, &[]);
    register_note(
        s,
        note_packed_len,
        note_type_id,
        indexed_fixed_fields,
        indexed_nullable_fields,
    );

    let note_properties = generate_note_properties(s);
    let note_interface_impl = generate_note_interface(s, note_type_id);

    quote {
        $note_properties
        $note_interface_impl
        $packable_impl
    }
}

/// Asserts that the note has an 'owner' field.
///
/// We require notes implemented with #[note] macro to have an 'owner' field because our auto-generated nullifier
/// functions expect it. This requirement is most likely only temporary.
comptime fn assert_has_owner(note: TypeDefinition) {
    let fields = note.fields_as_written();
    let mut has_owner = false;
    for i in 0..fields.len() {
        let (field_name, _, _) = fields[i];
        if field_name == quote { owner } {
            has_owner = true;
            break;
        }
    }
    assert(
        has_owner,
        "Note must have an 'owner' field. If your notes have no owner, use #[custom_note] insteadof #[note] and implement the NoteHashing trait manually.",
    );
}
