use crate::{note::note_getter_options::PropertySelector, prelude::Point};
use protocol_types::meta::{derive_packable_and_get_packed_len, generate_serialize_to_fields};
use std::{
    collections::umap::UHashMap,
    hash::{BuildHasherDefault, derive_generators, poseidon2::Poseidon2Hasher},
    meta::{type_of, unquote},
};

/// A map from note type to (note_struct_definition, note_packed_len, note_type_id, fields).
/// `fields` is an array of tuples where each tuple contains the name of the field/struct member (e.g. `amount`
/// in `TokenNote`), the index of where the packed member starts in the packed note and a flag indicating
/// whether the field is nullable or not.
pub comptime mut global NOTES: UHashMap<Type, (StructDefinition, u32, Field, [(Quoted, u32, bool)]), BuildHasherDefault<Poseidon2Hasher>> =
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
comptime fn derive_packable_if_not_implemented_and_get_len(s: StructDefinition) -> (Quoted, u32) {
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

/// Generates default `NoteInterface` implementation for a given note struct `s` and returns it as a quote.
///
/// impl NoteInterface for NoteStruct {
///     fn get_note_type_id() -> Field {
///         ...
///     }
///
///     fn compute_note_hash(self, storage_slot: Field) -> Field {
///         ...
///     }
/// }
comptime fn generate_note_interface(s: StructDefinition, note_type_id: Field) -> Quoted {
    let name = s.name();

    quote {
        impl aztec::note::note_interface::NoteInterface for $name {
            fn get_note_type_id() -> Field {
                $note_type_id
            }

            fn compute_note_hash(self, storage_slot: Field) -> Field {
                let inputs = aztec::protocol_types::utils::arrays::array_concat(self.pack(), [storage_slot]);
                aztec::protocol_types::hash::poseidon2_hash_with_separator(inputs, aztec::protocol_types::constants::GENERATOR_INDEX__NOTE_HASH)
            }
        }
    }
}

/// Generates default `NoteInterface` implementation for a given partial note struct `s` and returns it as a quote.
///
/// impl NoteInterface for NoteStruct {
///     fn get_note_type_id() -> Field {
///         ...
///     }
///
///     fn compute_note_hash(self, storage_slot: Field) -> Field {
///         ...
///     }
/// }
///
/// # On differences from `generate_note_interface`
/// We use multi-scalar multiplication (MSM) instead of Poseidon2 here since this is a partial note and therefore
/// does require MSM's additive homomorphism property (the property is used to add to the commitment in public).
/// We don't use this implementation for standard notes as well because Poseidon2 is significantly cheaper
/// constrains-wise.
///
/// # On including length in note hash preimage
/// For a given commitment C = a*G1 + b*G2 + c*G3 we take an x-coordinate of C.x and use it as the hash.
/// However, due to elliptic curve symmetry about the x-axis, for any x-coordinate,
/// there are two points with that x-coordinate. This means -C has the same hash (x-coord) as C,
/// and the tuple [-a, -b, -c] produces the same hash as [a, b, c].
///
/// This property makes the hash trivially not collision resistant without including the length.
/// By including the length l, the commitment becomes:
/// C = a*G1 + b*G2 + c*G3 + l*G_len
///
/// Since -l would be -3 (an extraordinarily large number that cannot be a valid preimage length),
/// including the length protects against these collisions.
comptime fn generate_note_interface_for_partial_note(
    s: StructDefinition,
    note_type_id: Field,
    indexed_fixed_fields: [(Quoted, Type, u32)],
    indexed_nullable_fields: [(Quoted, Type, u32)],
) -> Quoted {
    let name = s.name();

    // First we compute quotes for MSM
    // `compute_note_hash()` is computed over all the fields so we need to merge fixed and nullable.
    let merged_fields = indexed_fixed_fields.append(indexed_nullable_fields);
    // Now we prefix each of the merged fields with `self.` since they refer to the struct members here.
    let prefixed_merged_fields = merged_fields.map(|(name, typ, index): (Quoted, Type, u32)| {
        (quote { self.$name }, typ, index)
    });
    let (new_generators_list, new_scalars_list, _, new_aux_vars) =
        generate_multi_scalar_mul(prefixed_merged_fields);

    let (g_slot, g_len) = generate_fixed_generators();
    let new_generators = new_generators_list.push_back(g_slot).push_back(g_len).join(quote {,});

    let merged_fields_len = merged_fields.len() + 1; // +1 for the storage slot appended below
    let new_scalars = new_scalars_list
        .push_back(quote { std::hash::from_field_unsafe(storage_slot) })
        .push_back(quote { std::hash::from_field_unsafe($merged_fields_len) })
        .join(quote {,});

    quote {
        impl aztec::note::note_interface::NoteInterface for $name {
            fn get_note_type_id() -> Field {
                $note_type_id
            }

            fn compute_note_hash(self, storage_slot: Field) -> Field {
                $new_aux_vars
                let point = std::embedded_curve_ops::multi_scalar_mul(
                    [$new_generators],
                    [$new_scalars]
                );
                point.x
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
comptime fn generate_note_properties(s: StructDefinition) -> Quoted {
    let name = s.name();

    let struct_name = f"{name}Properties".quoted_contents();

    let property_selector_type = type_of(PropertySelector { index: 0, offset: 0, length: 0 });

    let note_fields = s.fields_as_written();

    let properties_types = note_fields
        .map(|(name, _): (Quoted, Type)| quote { pub $name: $property_selector_type })
        .join(quote {,});

    // TODO #8694: Properly handle non-field types https://github.com/AztecProtocol/aztec-packages/issues/8694
    let mut properties_list = &[];
    for i in 0..note_fields.len() {
        let (name, _) = note_fields[i];
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
    s: StructDefinition,
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

/// Number of fixed generators used to ensure that we don't have a collision of indices in derive_generators(...) in
/// the generate_multi_scalar_mul(...) function. If the indices collided this could result in a critical vulnerability
/// (e.g. in case of G_slot collision with other another note field an attacker could move a note to an arbitrary
/// slot).
global NUM_FIXED_GENERATORS: u32 = 2;

/// Generates G_slot and G_len generator point quotes.
comptime fn generate_fixed_generators() -> (Quoted, Quoted) {
    let generators: [Point; NUM_FIXED_GENERATORS] =
        derive_generators("aztec_nr_generators".as_bytes(), 0);

    let g_slot_x = generators[0].x;
    let g_slot_y = generators[0].y;
    let g_len_x = generators[1].x;
    let g_len_y = generators[1].y;

    let g_slot = quote {
        aztec::protocol_types::point::Point { x: $g_slot_x, y: $g_slot_y, is_infinite: false }
    };
    let g_len = quote {
        aztec::protocol_types::point::Point { x: $g_len_x, y: $g_len_y, is_infinite: false }
    };

    (g_slot, g_len)
}

/// Generates quotes necessary for multi-scalar multiplication of `indexed_fields` (indexed struct fields). Returns
/// a tuple containing quotes for generators, scalars, arguments and auxiliary variables. For more info on what are
/// auxiliary variables and how they are used, see `generate_serialize_to_fields` function.
///
/// Example return values:
/// generators_list: [aztec::generators::Ga1, aztec::generators::Ga2, aztec::generators::Ga3, aztec::generators::Ga4]
/// scalars_list: [
///     std::hash::from_field_unsafe(amount.lo as Field),
///     std::hash::from_field_unsafe(amount.hi as Field),
///     std::hash::from_field_unsafe(npk_m_hash as Field),
///     std::hash::from_field_unsafe(randomness as Field)
/// ]
/// args_list: [amount: U128, npk_m_hash: Field, randomness: Field]
/// aux_vars: []
comptime fn generate_multi_scalar_mul(
    indexed_fields: [(Quoted, Type, u32)],
) -> ([Quoted], [Quoted], [Quoted], Quoted) {
    let mut generators_list = &[];
    let mut scalars_list = &[];
    let mut args_list = &[];
    let mut aux_vars_list = &[];
    for i in 0..indexed_fields.len() {
        // Destructure tuple containing:
        // - field_name: the name of the struct field/member (as a Quoted type)
        // - typ: the type of the struct field/member (as a Type)
        // - field_start_index: index where this field starts in the serialized note array (as u32)
        let (field_name, typ, field_start_index) = indexed_fields[i];
        // We add NUM_FIXED_GENERATORS to the start index to avoid collision with fixed generators.
        let start_generator_index = NUM_FIXED_GENERATORS + field_start_index;
        let (serialization_fields, aux_vars) =
            generate_serialize_to_fields(field_name, typ, &[], true);
        for j in 0..serialization_fields.len() {
            let serialization_field = serialization_fields[j];
            let generator_index = start_generator_index + j;

            let generators: [Point; 1] =
                derive_generators("aztec_nr_generators".as_bytes(), generator_index);
            let generator_x = generators[0].x;
            let generator_y = generators[0].y;

            generators_list = generators_list.push_back(
                quote {
                aztec::protocol_types::point::Point { x: $generator_x, y: $generator_y, is_infinite: false }
                },
            );
            scalars_list = scalars_list.push_back(
                quote { std::hash::from_field_unsafe($serialization_field) },
            );
        }
        args_list = args_list.push_back(quote { $field_name: $typ });
        aux_vars_list = aux_vars_list.append(aux_vars);
    }

    let aux_vars = if aux_vars_list.len() > 0 {
        let joint = aux_vars_list.join(quote {;});
        quote { $joint; }
    } else {
        quote {}
    };
    (generators_list, scalars_list, args_list, aux_vars)
}

/// TODO: The macros shouldn't have a hard-coded opinion of a log layout; not even for partial notes.
/// Since partial notes are about to be refactored, I won't tackle it yet.
//
/// Generates setup payload for a given note struct `s`. The setup payload contains log plaintext and hiding point.
///
/// # On including length in note hash preimage
/// The hiding point is computed as a multi-scalar multiplication that includes the length of the preimage
/// to protect against collisions due to elliptic curve symmetry.
///
/// When computing a note hash in the partial notes flow, we take the hiding point, add the nullable fields to it
/// in public and then we take the x-coordinate of the point and use it as the note hash. E.g. for a given commitment
/// C = a*G1 + b*G2 + c*G3 we take an x-coordinate of C.x. However, due to elliptic curve symmetry about the x-axis,
/// for any x-coordinate, there are two points with that x-coordinate. This means -C has the same hash (x-coord) as C,
/// and the tuple [-a, -b, -c] produces the same hash as [a, b, c].
///
/// This property makes the hash trivially not collision resistant without including the length.
/// By including the length l, the commitment becomes:
/// C = a*G1 + b*G2 + c*G3 + l*G_len
///
/// Since -l would be -3 (an extraordinarily large number that cannot be a valid preimage length),
/// including the length protects against these collisions.
///
/// # Example function output
/// ```
/// struct TokenNoteSetupPayload {
///     log_plaintext: [u8; 160],
///     hiding_point: aztec::protocol_types::point::Point
/// }
///
/// impl TokenNoteSetupPayload {
///     fn new(mut self, npk_m_hash: Field, randomness: Field, storage_slot: Field) -> TokenNoteSetupPayload {
///         let hiding_point = std::embedded_curve_ops::multi_scalar_mul(
///             [
///                 Point { x: 0x..., y: 0x... },
///                 Point { x: 0x..., y: 0x... },
///                 Point { x: 0x..., y: 0x... },
///                 Point { x: 0x..., y: 0x... }
///             ],
///             [
///                 std::hash::from_field_unsafe(npk_m_hash),
///                 std::hash::from_field_unsafe(randomness),
///                 std::hash::from_field_unsafe(storage_slot),
///                 std::hash::from_field_unsafe(3)
///             ]
///         );
///
///         let let storage_slot_bytes = storage_slot.to_be_bytes();
///         let let note_type_id_bytes = TokenNote::get_note_type_id().to_be_bytes();
///
///         for i in 0..32 {
///             log_plaintext[i] = storage_slot_bytes[i];
///             log_plaintext[32 + i] = note_type_id_bytes[i];
///         }
///
///         let packed_note = [npk_m_hash as Field, randomness as Field];
///
///         for i in 0..packed_note.len() {
///             let bytes: [u8; 32] = packed_note[i].to_be_bytes();
///             for j in 0..32 {
///                 log_plaintext[64 + i * 32 + j] = bytes[j];
///             }
///         }
///
///         TokenNoteSetupPayload {
///             log_plaintext,
///             hiding_point
///         }
///     }
///
///     fn encrypt_log(self, context: &mut PrivateContext, recipient_keys: aztec::protocol_types::public_keys::PublicKeys, recipient: aztec::protocol_types::address::AztecAddress) -> [Field; 17] {
///
///         let encrypted_log_bytes: [u8; 513] = aztec::encrypted_logs::log_assembly_strategies::default_aes128::partial_note::::compute_partial_public_log_payload(
///             context.this_address(),
///             self.log_plaintext,
///             recipient,
///             sender
///         );
///
///         aztec::utils::bytes::be_bytes_31_to_fields(encrypted_log_bytes)
///     }
///
/// impl aztec::protocol_types::traits::Empty for TokenNoteSetupPayload {
///     fn empty() -> Self {
///         Self { log_plaintext: [0; 160], hiding_point: aztec::protocol_types::point::Point::empty() }
///     }
/// }
/// ```
comptime fn generate_setup_payload(
    s: StructDefinition,
    indexed_fixed_fields: [(Quoted, Type, u32)],
    indexed_nullable_fields: [(Quoted, Type, u32)],
) -> (Quoted, Quoted) {
    let name = s.name();
    let setup_payload_name = f"{name}SetupPayload".quoted_contents();

    // First we get the MSM related quotes
    let (new_generators_list, new_scalars_list, new_args_list, new_aux_vars) =
        generate_multi_scalar_mul(indexed_fixed_fields);
    let new_args = &[quote {mut self}]
        .append(new_args_list)
        .push_back(quote { storage_slot: Field })
        .join(quote {,});

    let (g_slot, g_len) = generate_fixed_generators();
    let new_generators = new_generators_list.push_back(g_slot).push_back(g_len).join(quote {,});
    let merged_fields_len = indexed_fixed_fields.len() + indexed_nullable_fields.len() + 1; // +1 for storage_slot
    let new_scalars = new_scalars_list
        .push_back(quote { std::hash::from_field_unsafe(storage_slot) })
        .push_back(quote { std::hash::from_field_unsafe($merged_fields_len) })
        .join(quote {,});

    // Then the log plaintext ones
    let log_plaintext_length = indexed_fixed_fields.len() * 32 + 64;
    let setup_log_plaintext: Quoted =
        get_setup_log_plaintext_body(s, log_plaintext_length, indexed_nullable_fields);

    // Then we compute values for `encrypt_log(...)` function.
    // First, the length of the items that are broken into bytes:
    let encrypted_log_bytes_length = 1 /* eph_pk_sign */
        + 48 /* header_ciphertext */
        + log_plaintext_length /* log_plaintext */
        + 16
        - (log_plaintext_length % 16); /* pkcs#7 aes padding */

    // Each field contains 31 bytes so the length in fields is computed as ceil(encrypted_log_byte_length / 31)
    // Recall: ceil(x / y) = (x + y - 1) // y (integer division).
    let encrypted_log_fields_length = 1 /* tag */
        + 1 /* eph_pk.x */
        + (encrypted_log_bytes_length + 30) / 31;

    (
        quote {
        pub struct $setup_payload_name {
            pub log_plaintext: [u8; $log_plaintext_length],
            pub hiding_point: aztec::protocol_types::point::Point
        }

        impl $setup_payload_name {
            pub fn new($new_args) -> $setup_payload_name {
                $new_aux_vars
                let hiding_point = std::embedded_curve_ops::multi_scalar_mul(
                    [$new_generators],
                    [$new_scalars]
                );
                $setup_log_plaintext

                $setup_payload_name {
                    log_plaintext,
                    hiding_point
                }
            }

            pub fn encrypt_log(self, context: &mut PrivateContext, recipient: aztec::protocol_types::address::AztecAddress, sender: aztec::protocol_types::address::AztecAddress) -> [Field; $encrypted_log_fields_length] {
                aztec::encrypted_logs::log_assembly_strategies::default_aes128::partial_note::compute_partial_public_log_payload(
                    context.this_address(),
                    self.log_plaintext,
                    recipient,
                    sender,
                )
            }
        }

        impl aztec::protocol_types::traits::Empty for $setup_payload_name {
            fn empty() -> Self {
                Self { log_plaintext: [0; $log_plaintext_length], hiding_point: aztec::protocol_types::point::Point::empty() }
            }
        }
    },
        setup_payload_name,
    )
}

/// Generates setup log plaintext for a given note struct `s`. The setup log plaintext is computed by serializing
/// storage slot from target function arguments, note type id from the note struct `s` and the fixed fields. The fixed
/// fields are obtained by passing the whole note struct to the `generate_serialize_to_fields(...)` function but omitting the
/// nullable fields.
comptime fn get_setup_log_plaintext_body(
    s: StructDefinition,
    log_plaintext_length: u32,
    indexed_nullable_fields: [(Quoted, Type, u32)],
) -> Quoted {
    let name = s.name();

    // Now we compute serialization of the fixed fields. We do that by passing the whole note struct
    // to the generate_serialize_to_fields function but we omit the nullable fields.
    let to_omit = indexed_nullable_fields.map(|(name, _, _): (Quoted, Type, u32)| name);
    let (fields_list, aux_vars) =
        generate_serialize_to_fields(quote { }, s.as_type(), to_omit, true);

    // If there are `aux_vars` we need to join them with `;` and add a trailing `;` to the joined string.
    let aux_vars_for_serialization = if aux_vars.len() > 0 {
        let joint = aux_vars.join(quote {;});
        quote { $joint; }
    } else {
        quote {}
    };
    let fields = fields_list.join(quote {,});

    quote {
        let mut log_plaintext: [u8; $log_plaintext_length] = [0; $log_plaintext_length];

        let storage_slot_bytes: [u8; 32] = storage_slot.to_be_bytes();
        let note_type_id_bytes: [u8; 32] = $name::get_note_type_id().to_be_bytes();

        for i in 0..32 {
            log_plaintext[i] = storage_slot_bytes[i];
            log_plaintext[32 + i] = note_type_id_bytes[i];
        }

        $aux_vars_for_serialization
        let packed_note = [$fields];

        for i in 0..packed_note.len() {
            let bytes: [u8; 32] = packed_note[i].to_be_bytes();
            for j in 0..32 {
                log_plaintext[64 + i * 32 + j] = bytes[j];
            }
        }
    }
}

/// Generates finalization payload for a given note struct `s`. The finalization payload contains log and note hash.
///
/// Example:
/// ```
/// struct TokenNoteFinalizationPayload {
///     context: &mut aztec::prelude::PublicContext,
///     hiding_point_slot: Field,
///     setup_log_slot: Field,
///     public_values: [Field; 2]
/// }
///
/// impl TokenNoteFinalizationPayload {
///     fn new(mut self, context: &mut aztec::prelude::PublicContext, slot: Field, amount: U128) -> TokenNoteFinalizationPayload {
///         self.context = context;
///         self.hiding_point_slot = slot;
///         self.setup_log_slot = slot + aztec::protocol_types::point::POINT_LENGTH as Field;
///         self.public_values = [amount.lo as Field, amount.hi as Field];
///         self
///     }
///
///     fn emit(self) {
///         self.emit_note_hash();
///         self.emit_log();
///     }
///
///     fn emit_note_hash(self) {
///         let hiding_point: aztec::prelude::Point = self.context.storage_read(self.hiding_point_slot);
///         assert(!aztec::protocol_types::traits::is_empty(hiding_point), "transfer not prepared");
///
///         let finalization_hiding_point = std::embedded_curve_ops::multi_scalar_mul([aztec::generators::Ga3, aztec::generators::Ga4], [std::hash::from_field_unsafe(self.public_values[0]), std::hash::from_field_unsafe(self.public_values[1])]) + hiding_point;
///
///         let note_hash = finalization_hiding_point.x;
///
///         self.context.push_note_hash(note_hash);
///
///         // We reset public storage to zero to achieve the effect of transient storage - kernels will squash
///         // the writes
///         // self.context.storage_write(self.hiding_point_slot, [0; aztec::protocol_types::point::POINT_LENGTH]);
///     }
///
///     fn emit_log(self) {
///         let setup_log_fields: [Field; 8] = self.context.storage_read(self.setup_log_slot);
///
///         let mut finalization_log = [0; 11];
///
///         for i in 0..setup_log_fields.len() {
///             finalization_log[i + 1] = setup_log_fields[i];
///         }
///
///         for i in 0..self.public_values.len() {
///            finalization_log[i + 1 + 8] = self.public_values[j];
///         }
///
///         finalization_log[0] = aztec::protocol_types::utils::field::field_from_bytes([
///                 (2 >> 8) as u8, 2 as u8, 0,
///                 (8 >> 8) as u8, 8 as u8, 0,
///                 (91 >> 8) as u8, 91 as u8,
///                ], true);
///
///         self.context.emit_public_log(finalization_log);
///
///         // We reset public storage to zero to achieve the effect of transient storage - kernels will squash
///         // the writes
///         // self.context.storage_write(self.setup_log_slot, [0; 8]);
///     }
/// }
///
/// impl aztec::protocol_types::traits::Empty for TokenNoteFinalizationPayload {
///     fn empty() -> Self {
///         Self { context: &mut aztec::prelude::PublicContext::empty(), hiding_point_slot: 0, setup_log_slot: 0, public_values: [0, 0] }
///     }
/// }
/// ```
comptime fn generate_finalization_payload(
    s: StructDefinition,
    indexed_fixed_fields: [(Quoted, Type, u32)],
    indexed_nullable_fields: [(Quoted, Type, u32)],
) -> (Quoted, Quoted) {
    let name = s.name();
    let finalization_payload_name = f"{name}FinalizationPayload".quoted_contents();

    // We compute serialization of the nullable fields which are to be emitted as a public log. We do that by
    // passing the whole note struct to the `generate_serialize_to_fields(...)` function but we omit the fixed fields.
    let to_omit = indexed_fixed_fields.map(|(name, _, _): (Quoted, Type, u32)| name);
    let (nullable_fields_list, aux_vars) =
        generate_serialize_to_fields(quote { }, s.as_type(), to_omit, true);

    // If there are `aux_vars` we need to join them with `;` and add a trailing `;` to the joined string.
    let aux_vars_for_serialization = if aux_vars.len() > 0 {
        let joint = aux_vars.join(quote {;});
        quote { $joint; }
    } else {
        quote {}
    };

    // We compute the log length and we concatenate the fields into a single quote.
    let public_values_length = nullable_fields_list.len();
    let nullable_fields = nullable_fields_list.join(quote {,});

    // Now we compute quotes relevant to the multi-scalar multiplication.
    // Note 1: We ignore the `scalars_list` and `aux_vars` return values because it's not used by the `emit_note_hash`
    // function. Instead, we use `public_values` (defined on the finalization payload struct) and the scalar list
    // is computed in the for-loop below.
    // Note 2: The `args_list` is not used for note hash MSM but instead for the `new` function.
    let (generators_list, _, args_list, _) = generate_multi_scalar_mul(indexed_nullable_fields);

    // We generate scalars_list manually as we need it to refer self.public_values
    let mut scalars_list: [Quoted] = &[];
    for i in 0..public_values_length {
        scalars_list =
            scalars_list.push_back(quote { std::hash::from_field_unsafe(self.public_values[$i]) });
    }

    let generators = generators_list.join(quote {,});
    let scalars = scalars_list.join(quote {,});
    let args = args_list.join(quote {,});

    // Then we compute values for `encrypt_log(...)` function
    let setup_log_plaintext_length = indexed_fixed_fields.len() * 32 + 64;

    let setup_log_bytes_length = 1 /* eph_pk_sign */
        + 48 /* header_ciphertext */
        + setup_log_plaintext_length /* log_plaintext */
        + 16
        - (setup_log_plaintext_length % 16); /* pkcs#7 aes padding */

    // Each field contains 31 bytes so the length in fields is computed as ceil(encrypted_log_byte_length / 31)
    // Recall: ceil(x / y) = (x + y - 1) // y (integer division).
    let setup_log_fields_length = 1 /* tag */
        + 1 /* eph_pk.x */
        + (setup_log_bytes_length + 30) / 31;

    let finalization_log_fields_length =
        1 /* some length encodings (see below) */ + setup_log_fields_length + public_values_length;

    (
        quote {
        pub struct $finalization_payload_name {
            pub context: &mut aztec::prelude::PublicContext,
            pub hiding_point_slot: Field,
            pub setup_log_slot: Field,
            pub public_values: [Field; $public_values_length],
        }

        impl $finalization_payload_name {
            pub fn new(mut self, context: &mut aztec::prelude::PublicContext, slot: Field, $args) -> $finalization_payload_name {
                self.context = context;

                self.hiding_point_slot = slot;
                self.setup_log_slot = slot + aztec::protocol_types::point::POINT_LENGTH as Field;

                $aux_vars_for_serialization
                self.public_values = [$nullable_fields];

                self
            }

            pub fn emit(self) {
                self.emit_note_hash();
                self.emit_log();
            }

            pub fn emit_note_hash(self) {
                // Read the hiding point from "transient" storage and check it's not empty to ensure the transfer was prepared
                let hiding_point: aztec::prelude::Point = self.context.storage_read(self.hiding_point_slot);
                assert(!aztec::protocol_types::traits::is_empty(hiding_point), "transfer not prepared");

                let finalization_hiding_point = std::embedded_curve_ops::multi_scalar_mul(
                    [$generators],
                    [$scalars]
                ) + hiding_point;

                let note_hash = finalization_hiding_point.x;

                self.context.push_note_hash(note_hash);

                // We reset public storage to zero to achieve the effect of transient storage - kernels will squash
                // the writes
                // TODO(#9376): Uncomment the following line.
                // self.context.storage_write(self.hiding_point_slot, [0; aztec::protocol_types::point::POINT_LENGTH]);
            }

            pub fn emit_log(self) {
                let max_log_len = aztec::protocol_types::constants::PUBLIC_LOG_DATA_SIZE_IN_FIELDS;
                // Make sure we aren't overflowing the public log maximum
                assert(
                    $finalization_log_fields_length <= max_log_len,
                    f"finalization public log must not exceed {max_log_len} fields",
                );

                // We load the setup log from storage
                let setup_log_fields: [Field; $setup_log_fields_length] = self.context.storage_read(self.setup_log_slot);

                // We append the public value to the log and emit it as unencrypted log
                let mut finalization_log = [0; $finalization_log_fields_length];

                // Populate the first field with number of public values and private values:
                // Search the codebase for "disgusting encoding" to see other hardcoded instances of this encoding, that you might need to change if you ever find yourself here.
                finalization_log[0] = aztec::protocol_types::utils::field::field_from_bytes([
                    ($public_values_length >> 8) as u8,
                    $public_values_length as u8,
                    0,
                    ($setup_log_fields_length >> 8) as u8,
                    $setup_log_fields_length as u8,
                ], true);
                let mut offset = 1;

                // Iterate over the partial log and copy it to the final log
                for i in 0..setup_log_fields.len() {
                    finalization_log[offset + i] = setup_log_fields[i];
                }
                offset += setup_log_fields.len();

                // Iterate over the public values and append them to the log
                for i in 0..self.public_values.len() {
                    finalization_log[offset + i] = self.public_values[i];
                }

                // We emit the finalization log via the public logs stream
                self.context.emit_public_log(finalization_log);

                // We reset public storage to zero to achieve the effect of transient storage - kernels will squash
                // the writes
                // TODO(#9376): Uncomment the following line.
                // self.context.storage_write(self.setup_log_slot, [0; $setup_log_field_length]);
            }
        }

        impl aztec::protocol_types::traits::Empty for $finalization_payload_name {
            fn empty() -> Self {
                Self { context: &mut aztec::prelude::PublicContext::empty(), public_values: [0; $public_values_length], hiding_point_slot: 0, setup_log_slot: 0 }
            }
        }
    },
        finalization_payload_name,
    )
}

/// Generates `PartialNote` implementation for a given note struct `s`.
///
/// Example:
/// ```
/// impl PartialNote<TokenNoteSetupPayload, TokenNoteFinalizationPayload> for TokenNote {
///     fn setup_payload() -> TokenNoteSetupPayload {
///         TokenNoteSetupPayload::empty()
///     }
///
///     fn finalization_payload() -> TokenNoteFinalizationPayload {
///         TokenNoteFinalizationPayload::empty()
///     }
/// }
/// ```
comptime fn generate_partial_note_impl(
    s: StructDefinition,
    setup_payload_name: Quoted,
    finalization_payload_name: Quoted,
) -> Quoted {
    let name = s.name();
    quote {
        impl aztec::note::note_interface::PartialNote<$setup_payload_name, $finalization_payload_name> for $name {
            fn setup_payload() -> $setup_payload_name {
                $setup_payload_name::empty()
            }

            fn finalization_payload() -> $finalization_payload_name {
                $finalization_payload_name::empty()
            }
        }
    }
}

/// Registers a note struct `note` with the given `note_packed_len`, `note_type_id`, `fixed_fields` and
/// `nullable_fields` in the global `NOTES` map.
comptime fn register_note(
    note: StructDefinition,
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
/// An example of a struct member occupying multiple fields is `amount` in `TokenNote` that uses `U128` type.
comptime fn index_note_fields(
    s: StructDefinition,
    nullable_fields: [Quoted],
) -> ([(Quoted, Type, u32)], [(Quoted, Type, u32)]) {
    let mut indexed_fixed_fields: [(Quoted, Type, u32)] = &[];
    let mut indexed_nullable_fields = &[];
    let mut counter: u32 = 0;
    for field in s.fields_as_written() {
        let (name, typ) = field;
        if nullable_fields.all(|field| field != name) {
            indexed_fixed_fields = indexed_fixed_fields.push_back((name, typ, counter));
        } else {
            indexed_nullable_fields = indexed_nullable_fields.push_back((name, typ, counter));
        }
        let (serialization_fields, _) = generate_serialize_to_fields(name, typ, &[], true);
        // Each struct member can occupy multiple fields so we need to increment the counter accordingly
        counter += serialization_fields.len();
    }
    (indexed_fixed_fields, indexed_nullable_fields)
}

/// Generates the following:
/// - NoteTypeProperties
/// - SetupPayload
/// - FinalizationPayload
/// - PartialNote trait implementation
/// - NoteExport
/// - NoteInterface trait implementation
/// - Packable implementation
///
/// Registers the note in the global `NOTES` map.
///
/// For more details on the generated code, see the individual functions.
///
/// `nullable_fields` are a list of quotes passed in as varargs which are used to identify which fields/struct members
/// in the partial note are nullable.
#[varargs]
pub comptime fn partial_note(s: StructDefinition, nullable_fields: [Quoted]) -> Quoted {
    // We separate struct members into fixed ones and nullable ones and we store info about the start index of each
    // member in the packed note array.
    let (indexed_fixed_fields, indexed_nullable_fields) = index_note_fields(s, nullable_fields);

    let note_properties = generate_note_properties(s);
    let note_type_id = get_next_note_type_id();
    let (setup_payload_impl, setup_payload_name) =
        generate_setup_payload(s, indexed_fixed_fields, indexed_nullable_fields);
    let (finalization_payload_impl, finalization_payload_name) =
        generate_finalization_payload(s, indexed_fixed_fields, indexed_nullable_fields);
    let note_interface_impl = generate_note_interface_for_partial_note(
        s,
        note_type_id,
        indexed_fixed_fields,
        indexed_nullable_fields,
    );
    let partial_note_impl =
        generate_partial_note_impl(s, setup_payload_name, finalization_payload_name);
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
        $setup_payload_impl
        $finalization_payload_impl
        $note_interface_impl
        $partial_note_impl
        $packable_impl
    }
}

/// Generates the following:
/// - NoteTypeProperties
/// - NoteInterface trait implementation
/// - Packable implementation
///
/// Registers the note in the global `NOTES` map.
///
/// For more details on the generated code, see the individual functions.
pub comptime fn note(s: StructDefinition) -> Quoted {
    let (indexed_fixed_fields, indexed_nullable_fields) = index_note_fields(s, &[]);

    let note_properties = generate_note_properties(s);
    let note_type_id = get_next_note_type_id();
    let note_interface_impl = generate_note_interface(s, note_type_id);
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
        $packable_impl
    }
}

/// Generates the following:
/// - NoteTypeProperties
/// - Packable implementation
///
/// Registers the note in the global `NOTES` map.
///
/// For more details on the generated code, see the individual functions.
pub comptime fn note_custom_interface(s: StructDefinition) -> Quoted {
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

    quote {
        $note_properties
        $packable_impl
    }
}
