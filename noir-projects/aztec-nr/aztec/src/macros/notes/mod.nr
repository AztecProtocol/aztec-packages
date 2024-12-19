use crate::{
    encrypted_logs::payload::OVERHEAD_SIZE,
    note::{note_getter_options::PropertySelector, note_header::NoteHeader},
    prelude::Point,
};
use protocol_types::meta::{flatten_to_fields, pack_from_fields};
use std::{
    collections::umap::UHashMap,
    hash::{BuildHasherDefault, derive_generators, poseidon2::Poseidon2Hasher},
    meta::{typ::fresh_type_variable, type_of, unquote},
};

comptime global NOTE_HEADER_TYPE: Type = type_of(NoteHeader::empty());

/// A map from note type to (note_struct_definition, serialized_note_length, note_type_id, fields).
/// `fields` is an array of tuples where each tuple contains the name of the field/struct member (e.g. `amount`
/// in `TokenNote`), the index of where the serialized member starts in the serialized note and a flag indicating
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

/// Generates default `NoteInterface` implementation for a given note struct `s` and returns it as quote along with
/// the length of the serialized note.
///
/// impl NoteInterface<N> for NoteStruct {
///     fn to_be_bytes(self, storage_slot: Field) -> [u8; N * 32 + 34] {
///         ...
///     }
///
///     fn deserialize_content(value: [Field; N]) -> Self {
///         ...
///     }
///
///     fn serialize_content(self) -> [Field; N] {
///         ...
///     }
///
///     fn get_note_type_id() -> Field {
///         ...
///     }
///
///     fn set_header(&mut self, header: NoteHeader) {
///         ...
///     }
///
///     fn get_header(self) -> NoteHeader {
///         ...
///     }
///
///     fn compute_note_hash(self) -> Field {
///         ...
///     }
/// }
comptime fn generate_note_interface(
    s: StructDefinition,
    note_type_id: Field,
    indexed_fixed_fields: [(Quoted, Type, u32)],
    indexed_nullable_fields: [(Quoted, Type, u32)],
) -> (Quoted, u32) {
    let name = s.name();
    let typ = s.as_type();

    // First we compute note content serialization. We do that by passing the whole note struct
    // to the `flatten_to_fields(...)` and omitting the header.
    let (content_fields_list, content_aux_vars_list) =
        flatten_to_fields(quote { self }, typ, &[quote {self.header}]);

    // If there are `aux_vars` we need to join them with `;` and add a trailing `;` to the joined string.
    let content_aux_vars = if content_aux_vars_list.len() > 0 {
        let joint = content_aux_vars_list.join(quote {;});
        quote { $joint; }
    } else {
        quote {}
    };
    let content_fields = content_fields_list.join(quote {,});
    let content_len = content_fields_list.len();

    let (deserialized_content, _) = pack_from_fields(
        quote { self },
        typ,
        quote { value },
        0,
        &[(quote {header}, quote { aztec::note::note_header::NoteHeader::empty() })],
    );

    // Second we compute quotes for MSM
    // `compute_note_hash()` is computed over all the fields so we need to merge fixed and nullable.
    let merged_fields = indexed_fixed_fields.append(indexed_nullable_fields);
    // Now we prefix each of the merged fields with `self.` since they refer to the struct members here.
    let prefixed_merged_fields = merged_fields.map(|(name, typ, index): (Quoted, Type, u32)| {
        (quote { self.$name }, typ, index)
    });
    let (new_generators_list, new_scalars_list, _, new_aux_vars) =
        generate_multi_scalar_mul(prefixed_merged_fields);

    let new_generators =
        new_generators_list.push_back(quote { aztec::generators::G_slot }).join(quote {,});
    let new_scalars = new_scalars_list
        .push_back(quote { std::hash::from_field_unsafe(self.header.storage_slot) })
        .join(quote {,});

    (
        quote {
        impl aztec::note::note_interface::NoteInterface<$content_len> for $name {
            fn to_be_bytes(self, storage_slot: Field) -> [u8; $content_len * 32 + 34] {
                let mut buffer: [u8; $content_len * 32 + 34] = [0; $content_len * 32 + 34];

                let storage_slot_bytes: [u8; 32] = storage_slot.to_be_bytes();
                // TODO(#10724): Since `note)type_id` is 7 bits long in the 2 bytes there is a space for a 1 bit
                // partial note flag.
                let note_type_id_bytes: [u8; 2] = $name::get_note_type_id().to_be_bytes();
                let serialized_note = self.serialize_content();

                for i in 0..32 {
                    buffer[i] = storage_slot_bytes[i];
                }

                for i in 0..2 {
                    buffer[32 + i] = note_type_id_bytes[i];
                }

                for i in 0..serialized_note.len() {
                    let bytes: [u8; 32] = serialized_note[i].to_be_bytes();
                    for j in 0..32 {
                        buffer[34 + i * 32 + j] = bytes[j];
                    }
                }
                buffer
            }

            fn deserialize_content(value: [Field; $content_len]) -> Self {
                $deserialized_content
            }

            fn serialize_content(self) -> [Field; $content_len] {
                $content_aux_vars
                [$content_fields]
            }

            fn get_note_type_id() -> Field {
                $note_type_id
            }

            fn set_header(&mut self, header: $NOTE_HEADER_TYPE) {
                self.header = header;
            }

            fn get_header(self) -> $NOTE_HEADER_TYPE {
                self.header
            }

            fn compute_note_hash(self) -> Field {
                $new_aux_vars
                let point = std::embedded_curve_ops::multi_scalar_mul(
                    [$new_generators],
                    [$new_scalars]
                );
                point.x
            }
        }
    },
        content_len,
    )
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
    let note_header_type: Type = type_of(NoteHeader::empty());

    let non_header_fields = s.fields().filter(|(_, typ): (Quoted, Type)| typ != note_header_type);

    let properties_types = non_header_fields
        .map(|(name, _): (Quoted, Type)| quote { pub $name: $property_selector_type })
        .join(quote {,});

    // TODO #8694: Properly handle non-field types https://github.com/AztecProtocol/aztec-packages/issues/8694
    let mut properties_list = &[];
    for i in 0..non_header_fields.len() {
        let (name, _) = non_header_fields[i];
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
    let global_export_name = f"{name}_{hash}_EXPORTS".quoted_contents();
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

/// Generates quotes necessary for multi-scalar multiplication of `indexed_fields` (indexed struct fields). Returns
/// a tuple containing quotes for generators, scalars, arguments and auxiliary variables. For more info on what are
/// auxiliary variables and how they are used, see `flatten_to_fields` function.
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
        let (field_name, typ, index) = indexed_fields[i];
        let start_generator_index = index + 1;
        let (flattened_field, aux_vars) = flatten_to_fields(field_name, typ, &[]);
        for j in 0..flattened_field.len() {
            let flattened_as_field = flattened_field[j];
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
            scalars_list =
                scalars_list.push_back(quote { std::hash::from_field_unsafe($flattened_as_field) });
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

/// Generates setup payload for a given note struct `s`. The setup payload contains log plaintext and hiding point.
///
/// Example:
/// ```
/// struct TokenNoteSetupPayload {
///     log_plaintext: [u8; 160],
///     hiding_point: aztec::protocol_types::point::Point
/// }
///
/// impl TokenNoteSetupPayload {
///     fn new(mut self, npk_m_hash: Field, randomness: Field, storage_slot: Field) -> TokenNoteSetupPayload {
///         let hiding_point = std::embedded_curve_ops::multi_scalar_mul(
///             [aztec::generators::Ga1, aztec::generators::Ga2, aztec::generators::G_slot],
///             [
///                 std::hash::from_field_unsafe(npk_m_hash),
///                 std::hash::from_field_unsafe(randomness),
///                 std::hash::from_field_unsafe(storage_slot)
///             ]
///         );
///
///         let let storage_slot_bytes = storage_slot.to_be_bytes();
///         let let note_type_id_bytes = TokenNote::get_note_type_id().to_be_bytes();
///         let serialized_note = [npk_m_hash as Field, randomness as Field];
///
///         for i in 0..32 {
///             log_plaintext[i] = storage_slot_bytes[i];
///         }
///
///         for i in 0..2 {
///             log_plaintext[32 + i] = note_type_id_bytes[i];
///         }
///
///
///         for i in 0..serialized_note.len() {
///             let bytes: [u8; 32] = serialized_note[i].to_be_bytes();
///             for j in 0..32 {
///                 log_plaintext[34 + i * 32 + j] = bytes[j];
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
///         let encrypted_log_bytes: [u8; 513] = aztec::encrypted_logs::payload::compute_partial_public_log_payload(
///             context.this_address(),
///             recipient,
///             self.log_plaintext
///         );
///
///         aztec::utils::bytes::bytes_to_fields(encrypted_log_bytes)
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
    let new_generators =
        new_generators_list.push_back(quote { aztec::generators::G_slot }).join(quote {,});
    let new_scalars = new_scalars_list
        .push_back(quote { std::hash::from_field_unsafe(storage_slot) })
        .join(quote {,});

    // Then the log plaintext ones
    let log_plaintext_length = indexed_fixed_fields.len() * 32 + 34;
    let setup_log_plaintext =
        get_setup_log_plaintext_body(s, log_plaintext_length, indexed_nullable_fields);

    // Then we compute values for `encrypt_log(...)` function
    let encrypted_log_byte_length = 32 /* tag */
        + OVERHEAD_SIZE
        + log_plaintext_length /* log_plaintext */
        + 2 /* log_plaintext_length */
        + 14 /* AES padding */;
    // Each field contains 31 bytes so the length in fields is computed as ceil(encrypted_log_byte_length / 31)
    // --> we achieve rounding by adding 30 and then dividing without remainder
    let encrypted_log_field_length = (encrypted_log_byte_length + 30) / 31;

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

            pub fn encrypt_log(self, context: &mut PrivateContext, recipient: aztec::protocol_types::address::AztecAddress, sender: aztec::protocol_types::address::AztecAddress) -> [Field; $encrypted_log_field_length] {
                let encrypted_log_bytes: [u8; $encrypted_log_byte_length] = aztec::encrypted_logs::payload::compute_partial_public_log_payload(
                    context.this_address(),
                    recipient,
                    sender,
                    self.log_plaintext,
                );

                aztec::utils::bytes::bytes_to_fields(encrypted_log_bytes)
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
/// fields are obtained by passing the whole note struct to the `flatten_to_fields(...)` function but omitting the
/// `NoteHeader` and the nullable fields.
comptime fn get_setup_log_plaintext_body(
    s: StructDefinition,
    log_plaintext_length: u32,
    indexed_nullable_fields: [(Quoted, Type, u32)],
) -> Quoted {
    let name = s.name();

    // Now we compute serialization of the fixed fields. We do that by passing the whole note struct
    // to the flatten_to_fields function but we omit the NoteHeader and the nullable fields.
    let to_omit = indexed_nullable_fields.map(|(name, _, _): (Quoted, Type, u32)| name).push_back(
        quote { header },
    );
    let (fields_list, aux_vars) = flatten_to_fields(quote { }, s.as_type(), to_omit);

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
        // TODO(#10724): Since `note_type_id` is 7 bits long in the 2 bytes there is a space for a 1 bit partial note
        // flag.
        let note_type_id_bytes: [u8; 2] = $name::get_note_type_id().to_be_bytes();

        for i in 0..32 {
            log_plaintext[i] = storage_slot_bytes[i];
        }

        for i in 0..2 {
            log_plaintext[32 + i] = note_type_id_bytes[i];
        }

        $aux_vars_for_serialization
        let serialized_note = [$fields];

        for i in 0..serialized_note.len() {
            let bytes: [u8; 32] = serialized_note[i].to_be_bytes();
            for j in 0..32 {
                log_plaintext[34 + i * 32 + j] = bytes[j];
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
///         let setup_log_fields: [Field; 16] = self.context.storage_read(self.setup_log_slot);
///
///         let setup_log: [u8; 481] = aztec::utils::bytes::fields_to_bytes(setup_log_fields);
///
///         let mut finalization_log = [0; 513];
///
///         for i in 0..setup_log.len() {
///             finalization_log[i] = setup_log[i];
///         }
///
///         for i in 0..self.public_values.len() {
///             let public_value_bytes: [u8; 32] = self.public_values[i].to_be_bytes();
///             for j in 0..public_value_bytes.len() {
///                 finalization_log[160 + i * 32 + j] = public_value_bytes[j];
///             }
///         }
///
///         self.context.emit_unencrypted_log(finalization_log);
///
///         // We reset public storage to zero to achieve the effect of transient storage - kernels will squash
///         // the writes
///         // self.context.storage_write(self.setup_log_slot, [0; 16]);
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

    // We compute serialization of the nullable fields which are to be emitted as an unencrypted log. We do that by
    // passing the whole note struct to the `flatten_to_fields(...)` function but we omit the `NoteHeader` and
    // the fixed fields.
    let to_omit = indexed_fixed_fields.map(|(name, _, _): (Quoted, Type, u32)| name).push_back(
        quote { header },
    );
    let (fields_list, aux_vars) = flatten_to_fields(quote { }, s.as_type(), to_omit);

    // If there are `aux_vars` we need to join them with `;` and add a trailing `;` to the joined string.
    let aux_vars_for_serialization = if aux_vars.len() > 0 {
        let joint = aux_vars.join(quote {;});
        quote { $joint; }
    } else {
        quote {}
    };

    // We compute the log length and we concatenate the fields into a single quote.
    let public_values_length = fields_list.len();
    let fields = fields_list.join(quote {,});

    // Now we compute quotes relevant to the multi-scalar multiplication.
    let (generators_list, _, args_list, msm_aux_vars) =
        generate_multi_scalar_mul(indexed_nullable_fields);

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
    let setup_log_plaintext_length = indexed_fixed_fields.len() * 32 + 34;
    let setup_log_byte_length = 32 /* tag */
        + OVERHEAD_SIZE
        + setup_log_plaintext_length
        + 2 /* log_plaintext_length */
        + 14 /* AES padding */;
    // Each field contains 31 bytes so the length in fields is computed as ceil(setup_log_byte_length / 31)
    // --> we achieve rounding by adding 30 and then dividing without remainder
    let setup_log_field_length = (setup_log_byte_length + 30) / 31;
    let public_values_field_length = public_values_length * 32;
    let finalization_log_byte_length =
        1 /* public_values_length */ + setup_log_byte_length + public_values_field_length;

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
                self.public_values = [$fields];

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

                $msm_aux_vars
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
                // We load the setup log from storage
                let setup_log_fields: [Field; $setup_log_field_length] = self.context.storage_read(self.setup_log_slot);

                // We convert the log from fields to bytes
                let setup_log: [u8; $setup_log_byte_length] = aztec::utils::bytes::fields_to_bytes(setup_log_fields);

                // We append the public value to the log and emit it as unencrypted log
                let mut finalization_log = [0; $finalization_log_byte_length];

                // Iterate over the partial log and copy it to the final log
                for i in 0..setup_log.len() {
                    finalization_log[i + 1] = setup_log[i];
                }

                // Iterate over the public values and append them to the log
                for i in 0..$public_values_length {
                    let public_value_bytes: [u8; 32] = self.public_values[i].to_be_bytes();
                    for j in 0..public_value_bytes.len() {
                        finalization_log[1 + $setup_log_byte_length + i * 32 + j] = public_value_bytes[j];
                    }
                }

                // Populate the first byte with number of public values
                finalization_log[0] = $public_values_length;

                // We emit the finalization log via the unencrypted logs stream
                self.context.emit_unencrypted_log(finalization_log);

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

/// Registers a note struct `note` with the given `note_serialized_len`, `note_type_id`, `fixed_fields` and
/// `nullable_fields` in the global `NOTES` map.
comptime fn register_note(
    note: StructDefinition,
    note_serialized_len: u32,
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

    NOTES.insert(note.as_type(), (note, note_serialized_len, note_type_id, fields));
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
    for field in s.fields() {
        let (name, typ) = field;
        if (typ != NOTE_HEADER_TYPE) {
            if nullable_fields.all(|field| field != name) {
                indexed_fixed_fields = indexed_fixed_fields.push_back((name, typ, counter));
            } else {
                indexed_nullable_fields = indexed_nullable_fields.push_back((name, typ, counter));
            }
        }
        let (flattened, _) = flatten_to_fields(name, typ, &[]);
        // Each struct member can occupy multiple fields so we need to increment the counter accordingly
        counter += flattened.len();
    }
    (indexed_fixed_fields, indexed_nullable_fields)
}

/// Injects `NoteHeader` to the note struct if not present.
comptime fn inject_note_header(s: StructDefinition) {
    let filtered_header = s.fields().filter(|(_, typ): (Quoted, Type)| typ == NOTE_HEADER_TYPE);
    if (filtered_header.len() == 0) {
        let new_fields = s.fields().push_back((quote { header }, NOTE_HEADER_TYPE));
        s.set_fields(new_fields);
    }
}

/// Injects `NoteHeader` to the note struct if not present and generates the following:
/// - NoteTypeProperties
/// - SetupPayload
/// - FinalizationPayload
/// - PartialNote trait implementation
/// - NoteExport
/// - NoteInterface trait implementation
/// - Registers the note in the global `NOTES` map.
///
/// For more details on the generated code, see the individual functions.
#[varargs]
pub comptime fn partial_note(s: StructDefinition, nullable_fields: [Quoted]) -> Quoted {
    // We separate struct members into fixed ones and nullable ones and we store info about the start index of each
    // member in the serialized note array.
    let (indexed_fixed_fields, indexed_nullable_fields) = index_note_fields(s, nullable_fields);

    // We inject NoteHeader if it's not present in the note struct.
    inject_note_header(s);

    let note_properties = generate_note_properties(s);
    let note_type_id = get_next_note_type_id();
    let (setup_payload_impl, setup_payload_name) =
        generate_setup_payload(s, indexed_fixed_fields, indexed_nullable_fields);
    let (finalization_payload_impl, finalization_payload_name) =
        generate_finalization_payload(s, indexed_fixed_fields, indexed_nullable_fields);
    let (note_interface_impl, note_serialized_len) = generate_note_interface(
        s,
        note_type_id,
        indexed_fixed_fields,
        indexed_nullable_fields,
    );
    let partial_note_impl =
        generate_partial_note_impl(s, setup_payload_name, finalization_payload_name);
    register_note(
        s,
        note_serialized_len,
        note_type_id,
        indexed_fixed_fields,
        indexed_nullable_fields,
    );

    quote {
        l
        $note_properties
        $setup_payload_impl
        $finalization_payload_impl
        $note_interface_impl
        $partial_note_impl
    }
}

/// Injects `NoteHeader` to the note struct if not present and generates the following:
/// - NoteTypeProperties
/// - NoteInterface trait implementation
/// - Registers the note in the global `NOTES` map.
///
/// For more details on the generated code, see the individual functions.
pub comptime fn note(s: StructDefinition) -> Quoted {
    let (indexed_fixed_fields, indexed_nullable_fields) = index_note_fields(s, &[]);

    // We inject NoteHeader if it's not present in the note struct.
    inject_note_header(s);

    let note_properties = generate_note_properties(s);
    let note_type_id = get_next_note_type_id();
    let (note_interface_impl, note_serialized_len) = generate_note_interface(
        s,
        note_type_id,
        indexed_fixed_fields,
        indexed_nullable_fields,
    );
    register_note(
        s,
        note_serialized_len,
        note_type_id,
        indexed_fixed_fields,
        indexed_nullable_fields,
    );

    quote {
        $note_properties
        $note_interface_impl
    }
}

/// Injects `NoteHeader` to the note struct if not present and generates the following:
/// - NoteTypeProperties
///
/// For more details on the generated code, see the individual functions.
pub comptime fn note_custom_interface(s: StructDefinition) -> Quoted {
    // We inject NoteHeader if it's not present in the note struct.
    inject_note_header(s);

    let note_properties = generate_note_properties(s);
    let note_type_id = get_next_note_type_id();
    let serialized_len_type = fresh_type_variable();
    let note_interface_impl = s.as_type().get_trait_impl(
        quote { crate::note::note_interface::NoteInterface<$serialized_len_type> }
            .as_trait_constraint(),
    );
    let name = s.name();

    let note_serialized_len = note_interface_impl
        .expect(f"Note {name} must implement NoteInterface trait")
        .trait_generic_args()[0]
        .as_constant()
        .unwrap();

    let (indexed_fixed_fields, indexed_nullable_fields) = index_note_fields(s, &[]);
    register_note(
        s,
        note_serialized_len,
        note_type_id,
        indexed_fixed_fields,
        indexed_nullable_fields,
    );

    quote {
        $note_properties
    }
}
