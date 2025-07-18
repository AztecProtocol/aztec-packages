use crate::{
    messages::discovery::private_notes::MAX_NOTE_PACKED_LEN,
    note::note_getter_options::PropertySelector,
};
use poseidon::poseidon2::Poseidon2Hasher;
use protocol_types::meta::derive_packable_and_get_packed_len;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault, meta::type_of};

/// A map from note type to note_packed_len.
pub comptime mut global NOTES: UHashMap<Type, u32, BuildHasherDefault<Poseidon2Hasher>> =
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

    let note_properties = generate_note_properties(s);
    let note_type_id = get_next_note_type_id();
    let note_interface_impl = generate_note_interface(s, note_type_id);
    let note_hash_impl = generate_note_hash_trait_impl(s);
    let (packable_impl, note_packed_len) = derive_packable_if_not_implemented_and_get_len(s);

    if note_packed_len > MAX_NOTE_PACKED_LEN {
        panic(
            f"{s} packs into {note_packed_len} fields which is larger than the maximum of {MAX_NOTE_PACKED_LEN}",
        );
    }

    NOTES.insert(s.as_type(), note_packed_len);

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

    if note_packed_len > MAX_NOTE_PACKED_LEN {
        panic(
            f"{s} packs into {note_packed_len} fields which is larger than the maximum of {MAX_NOTE_PACKED_LEN}",
        );
    }

    let note_type_id = get_next_note_type_id();

    let note_properties = generate_note_properties(s);
    let note_interface_impl = generate_note_interface(s, note_type_id);

    NOTES.insert(s.as_type(), note_packed_len);

    quote {
        $note_properties
        $note_interface_impl
        $packable_impl
    }
}

/// Asserts that the note has an 'owner' field.
///
/// We require notes implemented with #[note] macro macro to have an 'owner' field because our
/// auto-generated nullifier functions expect it. This requirement is most likely only temporary.
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
