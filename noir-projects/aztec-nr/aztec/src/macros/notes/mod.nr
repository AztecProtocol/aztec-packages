use std::{
    meta::{type_of, unquote}, collections::umap::UHashMap,
    hash::{BuildHasherDefault, poseidon2::Poseidon2Hasher}
};
use protocol_types::{meta::flatten_to_fields, utils::field::field_from_bytes};
use crate::note::{note_header::NoteHeader, note_getter_options::PropertySelector, note_interface::NoteInterface};
use protocol_types::meta::pack_from_fields;
use std::meta::typ::fresh_type_variable;

comptime global NOTE_HEADER_TYPE = type_of(NoteHeader::empty());

comptime mut global NOTES: UHashMap<Module, [(StructDefinition, u32, Field)], BuildHasherDefault<Poseidon2Hasher>> = UHashMap::default();

comptime fn compute_note_type_id(name: Quoted) -> Field {
    let name_as_str_quote = name.as_str_quote();

    let hash: [u8; 32] = unquote!(
        quote {
            let bytes = $name_as_str_quote.as_bytes();
            std::hash::keccak256(bytes, bytes.len() as u32)
        }
    );

    let mut selector_be_bytes = [0; 4];
    for i in 0..4 {
        selector_be_bytes[i] = hash[i];
    }

    field_from_bytes(selector_be_bytes, true)
}

comptime fn generate_note_interface(
    s: StructDefinition,
    note_type_id: Field,
    hiding_point_name: Quoted,
    fixed_fields: [(Quoted, Type)],
    nullable_fields: [Quoted]
) -> (Quoted, u32) {
    let name = s.name();
    let typ = s.as_type();
    let (fields, aux_vars) = flatten_to_fields(quote { self }, typ, &[quote {self.header}]);
    let aux_vars_for_serialization = if aux_vars.len() > 0 {
        let joint = aux_vars.join(quote {;});
        quote { $joint; }
    } else {
        quote {}
    };
    let serialized_fields = fields.join(quote {,});
    let content_len = fields.len();

    let (deserialized_content, _) = pack_from_fields(
        quote { self },
        typ,
        quote { value },
        0,
        &[(quote {header}, quote { NoteHeader::empty() })]
    );

    let fixed_fields_args = fixed_fields.map(| (name, _): (Quoted, Type) | quote{self.$name}).push_back(quote {self.get_header().storage_slot}).join(quote {,});
    let nullable_fields_args = nullable_fields.map(|field| quote { self.$field }).join(quote {,});

    (quote {
        impl aztec::note::note_interface::NoteInterface<$content_len> for $name {
            fn to_be_bytes(self, storage_slot: Field) -> [u8; $content_len * 32 + 64] {
                let serialized_note = self.serialize_content();

                let mut buffer: [u8; $content_len * 32 + 64] = [0; $content_len * 32 + 64];

                let storage_slot_bytes: [u8; 32] = storage_slot.to_be_bytes();
                let note_type_id_bytes: [u8; 32] = $name::get_note_type_id().to_be_bytes();

                for i in 0..32 {
                    buffer[i] = storage_slot_bytes[i];
                    buffer[32 + i] = note_type_id_bytes[i];
                }

                for i in 0..serialized_note.len() {
                    let bytes: [u8; 32] = serialized_note[i].to_be_bytes();
                    for j in 0..32 {
                        buffer[64 + i * 32 + j] = bytes[j];
                    }
                }
                buffer
            }

            fn deserialize_content(value: [Field; $content_len]) -> Self {
                $deserialized_content
            }

            fn serialize_content(self) -> [Field; $content_len] {
                $aux_vars_for_serialization
                [$serialized_fields]
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
                $hiding_point_name::empty().new($fixed_fields_args).finalize($nullable_fields_args)
            }
        }
    }, content_len)
}

comptime fn generate_note_properties(s: StructDefinition) -> Quoted {
    let name = s.name();

    let struct_name = f"{name}Properties".quoted_contents();

    let property_selector_type = type_of(PropertySelector { index: 0, offset: 0, length: 0 });
    let note_header_type: Type = type_of(NoteHeader::empty());

    let non_header_fields = s.fields().filter(| (_, typ): (Quoted, Type) | typ != note_header_type);

    let properties_types = non_header_fields.map(
        | (name, _): (Quoted, Type) | {
           quote { $name: $property_selector_type }
        }
    ).join(quote {,});

    // TODO: Properly handle non-field types
    let mut properties_list = &[];
    for i in 0..non_header_fields.len() {
        let (name, _) = non_header_fields[i];
        properties_list = properties_list.push_back(quote { $name: aztec::note::note_getter_options::PropertySelector { index: $i, offset: 0, length: 32 } });
    }

    let properties = properties_list.join(quote {,});

    quote {
        struct $struct_name {
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

pub(crate) comptime fn generate_note_export(s: StructDefinition, note_type_id: Field) -> Quoted {
    let name = s.name();
    let global_export_name = f"{name}_EXPORTS".quoted_contents();
    let note_name_as_str = name.as_str_quote();
    let note_name_str_len = unquote!(quote { $note_name_as_str.as_bytes().len() });
    let note_type_id_hex = f"0x{note_type_id}".quoted_contents();
    quote {
        #[abi(notes)]
        global $global_export_name: (Field, str<$note_name_str_len>) = ($note_type_id_hex,$note_name_as_str);
    }
}

comptime fn generate_note_hiding_point(
    s: StructDefinition,
    fixed_fields: [(Quoted, Type)],
    nullable_fields: [Quoted]
) -> (Quoted, Quoted) {
    let name = s.name();
    let hiding_point_name = f"{name}HidingPoint".quoted_contents();

    let mut new_generators_list = &[];
    let mut new_scalars_list = &[];
    let mut new_args_list = &[quote {mut self}];
    let mut new_generics_list = &[];
    let mut new_trait_bounds_list = &[];

    for i in 0..fixed_fields.len() {
        let (field_name, _) = fixed_fields[i];
        let arg_type = f"N{i}".quoted_contents();
        let generator_index = i + 1;
        new_generators_list = new_generators_list.push_back(f"aztec::generators::Ga{generator_index}".quoted_contents());
        new_scalars_list = new_scalars_list.push_back(quote { std::hash::from_field_unsafe($field_name.to_field()) });
        new_args_list = new_args_list.push_back(quote { $field_name: $arg_type });
        new_generics_list = new_generics_list.push_back(quote { $arg_type });
        new_trait_bounds_list = new_trait_bounds_list.push_back(quote { $arg_type: aztec::protocol_types::traits::ToField });
    }

    new_args_list = new_args_list.push_back(quote { storage_slot: Field });
    let new_generators = new_generators_list.push_back(quote { aztec::generators::G_slot }).join(quote {,});
    let new_scalars = new_scalars_list.push_back(quote { std::hash::from_field_unsafe(storage_slot) }).join(quote {,});
    let new_args = new_args_list.join(quote {,});

    let new_generics = if new_generics_list.len() > 0 {
        let generics = new_generics_list.join(quote {,});
        quote {<$generics>}
    } else {
        quote {}
    };

    let new_trait_bounds = if new_trait_bounds_list.len() > 0 {
        let bounds = new_trait_bounds_list.join(quote {,});
        quote {where $bounds}
    } else {
        quote {}
    };

    let mut finalize_generators_list = &[];
    let mut finalize_scalars_list = &[];
    let mut finalize_args_list = &[];
    let mut finalize_generics_list = &[];
    let mut finalize_trait_bounds_list = &[];

    for i in 0..nullable_fields.len() {
        let field_name = nullable_fields[i];
        let arg_type = f"N{i}".quoted_contents();
        finalize_args_list = finalize_args_list.push_back(quote { $field_name: $arg_type });
        let generator_index = i + 1 + fixed_fields.len();
        finalize_generators_list = finalize_generators_list.push_back(f"aztec::generators::Ga{generator_index}".quoted_contents());
        finalize_scalars_list = finalize_scalars_list.push_back(quote { std::hash::from_field_unsafe($field_name.to_field()) });
        finalize_generics_list = finalize_generics_list.push_back(quote { $arg_type });
        finalize_trait_bounds_list = finalize_trait_bounds_list.push_back(quote { $arg_type: aztec::protocol_types::traits::ToField });
    }

    let finalize_args = if finalize_args_list.len() > 0 {
        &[quote {self}].append(finalize_args_list).join(quote {,})
    } else {
        quote {self}
    };

    let finalize_body = if nullable_fields.len() > 0 {
        let finalize_generators = finalize_generators_list.join(quote {,});
        let finalize_scalars = finalize_scalars_list.join(quote {,});
        quote {
            let point = std::embedded_curve_ops::multi_scalar_mul(
                [$finalize_generators],
                [$finalize_scalars]
            ) + self.inner;
            point.x
        }
    } else {
        quote { self.inner.x }
    };

    let finalize_name = if finalize_generics_list.len() > 0 {
        let generics = finalize_generics_list.join(quote {,});
        quote {finalize<$generics>}
    } else {
        quote {finalize}
    };

    let finalize_trait_bounds = if finalize_trait_bounds_list.len() > 0 {
        let bounds = finalize_trait_bounds_list.join(quote {,});
        quote {where $bounds}
    } else {
        quote {}
    };

    (quote {
        struct $hiding_point_name {
            inner: aztec::protocol_types::point::Point
        }

        impl $hiding_point_name {
            fn new$new_generics($new_args) -> $hiding_point_name $new_trait_bounds {
                let point = std::embedded_curve_ops::multi_scalar_mul(
                    [$new_generators],
                    [$new_scalars]
                );
                self.inner = point;
                self
            }

            fn from_point(mut self, point: aztec::protocol_types::point::Point) -> $hiding_point_name {
                self.inner = point;
                self
            }


            fn $finalize_name($finalize_args) -> Field $finalize_trait_bounds {
                $finalize_body
            }
        }

        impl aztec::protocol_types::traits::Serialize<aztec::protocol_types::point::POINT_LENGTH> for $hiding_point_name {
            fn serialize(self) -> [Field; aztec::protocol_types::point::POINT_LENGTH] {
                self.inner.serialize()
            }
        }

        impl aztec::protocol_types::traits::Deserialize<aztec::protocol_types::point::POINT_LENGTH> for $hiding_point_name {
            fn deserialize(serialized: [Field; aztec::protocol_types::point::POINT_LENGTH]) -> $hiding_point_name {
                $hiding_point_name { inner: aztec::protocol_types::point::Point::deserialize(serialized) }
            }
        }

        impl aztec::protocol_types::traits::Empty for $hiding_point_name {
            fn empty() -> Self {
                Self { inner: aztec::protocol_types::point::Point::empty() }
            }
        }

        impl Eq for $hiding_point_name {
            fn eq(self, other: Self) -> bool {
                self.inner == other.inner
            }
        }

    }, hiding_point_name)
}

comptime fn generate_partial_note_impl(s: StructDefinition, hiding_point_name: Quoted) -> Quoted {
    let name = s.name();
    quote {
        impl aztec::note::note_interface::PartialNote<$hiding_point_name> for $name {
            fn hiding_point() -> $hiding_point_name {
                $hiding_point_name::empty()
            }
        }
    }
}

comptime fn register_note(note: StructDefinition, note_serialized_len: u32, note_type_id: Field) {
    let current_notes = unsafe {
        NOTES.get(note.module())
    };
    let notes_to_insert = if current_notes.is_some() {
        current_notes.unwrap().push_back((note, note_serialized_len, note_type_id))
    } else {
        &[(note, note_serialized_len, note_type_id)]
    };
    NOTES.insert(note.module(), notes_to_insert);
}

comptime fn extract_fixed_fields(s: StructDefinition, nullable_fields: [Quoted]) -> [(Quoted, Type)] {
    s.fields().filter(
        | (name, typ): (Quoted, Type) | (typ != NOTE_HEADER_TYPE) & nullable_fields.all(| field | field != name)
    )
}

comptime fn common_note_annotation(
    s: StructDefinition,
    fixed_fields: [(Quoted, Type)],
    nullable_fields: [Quoted]
) -> (Quoted, Quoted, Field) {
    // Automatically inject header if not present
    let filtered_header = s.fields().filter(| (_, typ): (Quoted, Type) | typ == NOTE_HEADER_TYPE);
    if (filtered_header.len() == 0) {
        let new_fields = s.fields().push_back((quote { header }, NOTE_HEADER_TYPE));
        s.set_fields(new_fields);
    }
    let (note_hiding_point, hiding_point_name) = generate_note_hiding_point(s, fixed_fields, nullable_fields);
    let note_properties = generate_note_properties(s);
    let note_type_id = compute_note_type_id(s.name());

    (quote {
        $note_properties
        $note_hiding_point
    }, hiding_point_name, note_type_id)
}

#[varargs]
pub comptime fn partial_note(s: StructDefinition, nullable_fields: [Quoted]) -> Quoted {
    let fixed_fields = extract_fixed_fields(s, nullable_fields);
    let (common, hiding_point_name, note_type_id) = common_note_annotation(s, fixed_fields, nullable_fields);
    let (note_interface_impl, note_serialized_len) = generate_note_interface(
        s,
        note_type_id,
        hiding_point_name,
        fixed_fields,
        nullable_fields
    );
    let partial_note_impl = generate_partial_note_impl(s, hiding_point_name);
    register_note(s, note_serialized_len, note_type_id);

    quote {
        $common
        $note_interface_impl
        $partial_note_impl
    }
}

pub comptime fn note(s: StructDefinition) -> Quoted {
    let fixed_fields = extract_fixed_fields(s, &[]);
    let (common, hiding_point_name, note_type_id) = common_note_annotation(s, fixed_fields, &[]);
    let (note_interface_impl, note_serialized_len) = generate_note_interface(s, note_type_id, hiding_point_name, fixed_fields, &[]);
    register_note(s, note_serialized_len, note_type_id);

    quote {
        $common
        $note_interface_impl
    }
}

pub comptime fn note_custom_interface(s: StructDefinition) -> Quoted {
    let fixed_fields = extract_fixed_fields(s, &[]);
    let (common, _, note_type_id) = common_note_annotation(s, fixed_fields, &[]);

    let serialized_len_type = fresh_type_variable();
    let note_interface_impl = s.as_type().get_trait_impl(quote { NoteInterface<$serialized_len_type> }.as_trait_constraint());
    let name = s.name();
    assert(note_interface_impl.is_some(), f"Note {name} must implement NoteInterface trait");

    let note_serialized_len = note_interface_impl.unwrap().trait_generic_args()[0].as_constant().unwrap();

    register_note(s, note_serialized_len, note_type_id);

    quote {
        $common
    }
}
